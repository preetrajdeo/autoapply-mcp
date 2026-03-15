// src/lib/filler.ts
// Ports the Chrome extension filler.js logic to Playwright.
// All heavy lifting runs inside page.evaluate() — same JS, no cross-realm issues.

import { Page } from "playwright";

export interface Profile {
  personal?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    linkedIn?: string;
    github?: string;
    portfolio?: string;
    willingToRelocate?: boolean;
    hearAbout?: string;
    address?: {
      street?: string; city?: string; state?: string; zip?: string; country?: string;
    };
  };
  demographics?: {
    gender?: string; ethnicity?: string; veteranStatus?: string;
    disabilityStatus?: string; requiresSponsorship?: boolean; authorizedToWork?: boolean;
  };
  education?: Array<{ degree?: string; institution?: string }>;
  salary?: { desiredMin?: string };
}

export interface FillResult {
  filled: FieldResult[];
  uniqueQuestions: UniqueQuestion[];
  skipped: string[];
}

export interface FieldResult {
  label: string;
  key: string;
  status: "filled" | "failed" | "no-value";
}

export interface UniqueQuestion {
  labelText: string;
  selector: string;
  currentValue: string;
  fieldType: "text" | "combobox" | "select";
  options?: string[];
}

/** Run the full form fill in the page context */
export async function fillForm(page: Page, profile: Profile): Promise<FillResult> {
  return page.evaluate((profileJson: string) => {
    const profile = JSON.parse(profileJson) as Record<string, unknown>;

    // ── Helpers ──────────────────────────────────────────────────────────────
    function norm(s: unknown): string {
      return String(s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    }
    function toTitleCase(s: string): string {
      return s.replace(/\b\w/g, (c) => c.toUpperCase());
    }

    // ── Field Map ─────────────────────────────────────────────────────────────
    const FIELD_MAP: Record<string, string[]> = {
      fullName:    ["^name$", "full name", "your name", "applicant name", "legal name"],
      firstName:   ["first name", "given name", "fname"],
      lastName:    ["last name", "surname", "family name", "lname"],
      email:       ["email", "email address", "work email", "e-mail"],
      phone:       ["phone", "mobile", "telephone", "cell", "phone number"],
      linkedin:    ["linkedin", "linkedin url", "linkedin profile"],
      github:      ["github", "github url"],
      portfolio:   ["portfolio", "personal site", "personal website"],
      sponsorship: ["sponsorship", "visa sponsorship", "require sponsorship"],
      authorized:  ["authorized", "work authorization", "legally authorized", "eligible to work"],
      willingToRelocate: ["willing to relocate", "open to relocation", "able to relocate", "relocate for", "relocation"],
      hearAbout:   ["how did you hear", "how did you find", "how did you learn", "where did you hear"],
      city:        ["city", "town", "municipality"],
      state:       ["^state$", "province", "region", "state province"],
      zip:         ["zip", "postal code", "zip code", "postcode"],
      country:     ["country", "nation"],
      street:      ["street address", "address line 1", "address line one", "mailing address", "home address", "street"],
      gender:      ["gender", "gender identity"],
      ethnicity:   ["ethnicity", "race", "racial background"],
      veteran:     ["veteran", "veteran status"],
      disability:  ["disability", "disability status"],
      salary:      ["salary", "desired salary", "expected compensation"],
    };

    function mapFieldLabel(label: string): string | null {
      const n = norm(label);
      for (const [key, patterns] of Object.entries(FIELD_MAP)) {
        for (const p of patterns) {
          if (p.startsWith("^") && p.endsWith("$")) {
            if (n === p.slice(1, -1)) return key;
          } else if (n.includes(p)) {
            return key;
          }
        }
      }
      return null;
    }

    // ── Profile value resolver ────────────────────────────────────────────────
    const p = profile as any;
    const fullName = `${p.personal?.firstName ?? ""} ${p.personal?.lastName ?? ""}`.trim();
    const VALUE_MAP: Record<string, string> = {
      fullName:          toTitleCase(fullName),
      firstName:         toTitleCase(p.personal?.firstName ?? ""),
      lastName:          toTitleCase(p.personal?.lastName ?? ""),
      email:             p.personal?.email ?? "",
      phone:             p.personal?.phone ?? "",
      linkedin:          p.personal?.linkedIn ?? "",
      github:            p.personal?.github ?? "",
      portfolio:         p.personal?.portfolio ?? "",
      street:            p.personal?.address?.street ?? "",
      city:              p.personal?.address?.city ?? "",
      state:             p.personal?.address?.state ?? "",
      zip:               p.personal?.address?.zip ?? "",
      country:           p.personal?.address?.country ?? "",
      gender:            p.demographics?.gender ?? "",
      ethnicity:         p.demographics?.ethnicity ?? "",
      veteran:           p.demographics?.veteranStatus ?? "",
      disability:        p.demographics?.disabilityStatus ?? "",
      sponsorship:       p.demographics?.requiresSponsorship ? "Yes" : "No",
      authorized:        p.demographics?.authorizedToWork !== false ? "Yes" : "No",
      willingToRelocate: p.personal?.willingToRelocate !== false ? "Yes" : "No",
      hearAbout:         p.personal?.hearAbout ?? "LinkedIn",
      salary:            p.salary?.desiredMin ?? "",
    };

    // ── React-Select filler (works in page context — no cross-realm issues) ──
    function fillReactSelect(input: HTMLInputElement, value: string): boolean {
      if (!input.id) {
        input.id = `aq-rs-${Math.random().toString(36).slice(2, 8)}`;
      }
      const script = document.createElement("script");
      script.textContent = `(function(){
        var input = document.getElementById(${JSON.stringify(input.id)});
        if (!input) return;
        var norm = function(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\\s+/g,' ').trim(); };
        var nv = norm(${JSON.stringify(value)});
        function selectInNode(node) {
          var props = node.memoizedProps || node.pendingProps;
          var options = props.options || [];
          var match = options.find(function(o){ return norm(o.label) === nv; }) ||
                      options.find(function(o){ return norm(o.label).includes(nv) || nv.includes(norm(o.label)); }) ||
                      options.find(function(o){ return norm(String(o.value)).includes(nv); });
          if (match) { node.stateNode.selectOption(match); return true; }
          return false;
        }
        function walkDown(node, d) {
          if (!node || d > 30) return null;
          if (node.stateNode && typeof node.stateNode.selectOption === 'function') return node;
          return walkDown(node.child, d+1) || walkDown(node.sibling, d+1);
        }
        function walkUp(fiber) {
          var node = fiber;
          for (var j = 0; j < 40 && node; j++) {
            if (node.stateNode && typeof node.stateNode.selectOption === 'function') return node;
            node = node.return;
          }
          return null;
        }
        var el = input.parentElement;
        for (var i = 0; i < 12 && el; i++) {
          var key = Object.keys(el).find(function(k){ return k.startsWith('__reactFiber'); });
          if (key) {
            var node = walkDown(el[key], 0) || walkUp(el[key]);
            if (node && selectInNode(node)) break;
          }
          el = el.parentElement;
        }
      })();`;
      document.head.appendChild(script);
      script.remove();
      return true;
    }

    // ── Native setter ─────────────────────────────────────────────────────────
    function fillText(el: HTMLInputElement | HTMLTextAreaElement, value: string): boolean {
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(el, value); else (el as any).value = value;
      el.dispatchEvent(new Event("input",  { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
      return true;
    }

    // ── Label extraction ──────────────────────────────────────────────────────
    function extractFieldLabel(el: Element): string {
      if (el.id) {
        const labelEl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (labelEl) return labelEl.textContent?.trim() ?? "";
      }
      const ariaLabel = el.getAttribute("aria-label");
      if (ariaLabel) return ariaLabel.trim();
      const ariaLabelledBy = el.getAttribute("aria-labelledby");
      if (ariaLabelledBy) {
        const texts = ariaLabelledBy.split(" ").map(id => document.getElementById(id)?.textContent?.trim()).filter(Boolean);
        if (texts.length) return texts.join(" ");
      }
      let parent = el.parentElement;
      for (let i = 0; i < 6 && parent; i++) {
        const label = parent.querySelector("label");
        if (label && !label.htmlFor) return label.textContent?.trim() ?? "";
        const placeholder = el.getAttribute("placeholder");
        if (placeholder) return placeholder;
        parent = parent.parentElement;
      }
      return el.getAttribute("name") ?? el.id ?? "";
    }

    // ── Get React-Select options for sidebar ─────────────────────────────────
    function getReactSelectOptions(input: HTMLInputElement): string[] {
      function walkDown(node: any, d: number): any {
        if (!node || d > 30) return null;
        if (node.stateNode && typeof node.stateNode.selectOption === 'function') return node;
        return walkDown(node.child, d+1) || walkDown(node.sibling, d+1);
      }
      function walkUp(fiber: any): any {
        let node = fiber;
        for (let j = 0; j < 40 && node; j++) {
          if (node.stateNode && typeof node.stateNode.selectOption === 'function') return node;
          node = node.return;
        }
        return null;
      }
      let el: Element | null = input.parentElement;
      for (let i = 0; i < 12 && el; i++) {
        const key = Object.keys(el).find(k => k.startsWith("__reactFiber"));
        if (key) {
          const fiber = (el as any)[key];
          const node = walkDown(fiber, 0) || walkUp(fiber);
          if (node) {
            const props = node.memoizedProps || node.pendingProps;
            return (props.options ?? []).map((o: any) => String(o.label));
          }
        }
        el = el.parentElement;
      }
      return [];
    }

    // ── Native <select> fill ──────────────────────────────────────────────────
    function fillNativeSelect(el: HTMLSelectElement, value: string): boolean {
      const nv = norm(value);
      const NEGATION_RE = /\b(no|not|never|don.t|do not|without|unable|decline|prefer not)\b/;
      const wantYes = value === "Yes";
      if (value === "Yes" || value === "No") {
        for (const opt of el.options) {
          if (!opt.value) continue;
          const combined = norm(opt.text) + " " + norm(opt.value);
          const hasNeg = NEGATION_RE.test(combined);
          if (wantYes ? !hasNeg : hasNeg) {
            el.value = opt.value;
            el.dispatchEvent(new Event("change", { bubbles: true }));
            return true;
          }
        }
      }
      for (const opt of el.options) {
        if (!opt.value) continue;
        const ot = norm(opt.text), ov = norm(opt.value);
        if (ot.includes(nv) || nv.includes(ot) || ov.includes(nv) || nv.includes(ov)) {
          el.value = opt.value;
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
      }
      return false;
    }

    // ── Main loop ─────────────────────────────────────────────────────────────
    const filled: Array<{label:string;key:string;status:"filled"|"failed"|"no-value"}> = [];
    const uniqueQuestions: Array<{labelText:string;selector:string;currentValue:string;fieldType:"text"|"combobox"|"select";options?:string[]}> = [];
    const skipped: string[] = [];

    const fields = Array.from(document.querySelectorAll<HTMLElement>(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]),' +
      'textarea, select'
    ));

    for (const field of fields) {
      if (field.offsetParent === null && window.getComputedStyle(field).display === "none") continue;
      if ((field as HTMLInputElement).type === "file") continue;

      const el = field as HTMLInputElement;
      const rawLabel = extractFieldLabel(field);
      const key = mapFieldLabel(rawLabel);

      // Unmapped combobox/select with question-like label → unique question
      if (!key) {
        const isSelect   = field.tagName === "SELECT";
        const isCombobox = field.getAttribute("role") === "combobox";
        if ((isSelect || isCombobox) && rawLabel && (rawLabel.includes("?") || rawLabel.length > 30)) {
          let selector = field.id ? `#${CSS.escape(field.id)}` :
                         (field as any).name ? `[name="${CSS.escape((field as any).name)}"]` : null;
          if (!selector) {
            const uid = `aq-${Math.random().toString(36).slice(2,8)}`;
            (field as any).dataset.autoapplyUid = uid;
            selector = `[data-autoapply-uid="${uid}"]`;
          }
          const opts = isSelect
            ? Array.from((field as HTMLSelectElement).options).map(o => o.text).filter(Boolean)
            : getReactSelectOptions(el);
          uniqueQuestions.push({
            labelText: rawLabel,
            selector,
            currentValue: (field as any).value || "",
            fieldType: isCombobox ? "combobox" : "select",
            options: opts,
          });
          continue;
        }

        // Unmapped textarea → unique question
        if (field.tagName === "TEXTAREA" || (field.tagName === "INPUT" && parseInt(el.getAttribute("rows") ?? "1") > 1)) {
          let selector = field.id ? `#${CSS.escape(field.id)}` : null;
          if (!selector) {
            const uid = `aq-${Math.random().toString(36).slice(2,8)}`;
            (field as any).dataset.autoapplyUid = uid;
            selector = `[data-autoapply-uid="${uid}"]`;
          }
          uniqueQuestions.push({ labelText: rawLabel || "Open-ended question", selector: selector!, currentValue: (field as any).value || "", fieldType: "text" });
          continue;
        }

        skipped.push(rawLabel || field.id || field.tagName);
        continue;
      }

      const value = VALUE_MAP[key] ?? null;
      if (!value) {
        filled.push({ label: rawLabel, key, status: "no-value" });
        continue;
      }

      let ok = false;
      if (field.tagName === "SELECT") {
        ok = fillNativeSelect(field as HTMLSelectElement, value);
      } else if (field.tagName === "TEXTAREA") {
        ok = fillText(el as any, value);
      } else if (field.getAttribute("role") === "combobox") {
        ok = fillReactSelect(el, value);
      } else {
        ok = fillText(el as any, value);
      }

      filled.push({ label: rawLabel, key, status: ok ? "filled" : "failed" });
    }

    return { filled, uniqueQuestions, skipped };
  }, JSON.stringify(profile));
}

/** Fill a single answer into a specific field by selector */
export async function fillAnswer(page: Page, selector: string, answer: string): Promise<boolean> {
  return page.evaluate(({ selector, answer }) => {
    const field = document.querySelector(selector) as HTMLElement | null;
    if (!field) return false;
    const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    const nv = norm(answer);

    if (field.tagName === "SELECT") {
      const sel = field as HTMLSelectElement;
      for (const opt of sel.options) {
        if (!opt.value) continue;
        if (norm(opt.text).includes(nv) || nv.includes(norm(opt.text))) {
          sel.value = opt.value;
          sel.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
      }
      return false;
    }

    if (field.getAttribute("role") === "combobox") {
      const script = document.createElement("script");
      script.textContent = `(function(){
        var input = document.querySelector(${JSON.stringify(selector)});
        if (!input) return;
        var norm = function(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\\s+/g,' ').trim(); };
        var nv = norm(${JSON.stringify(answer)});
        function walkDown(node, d) {
          if (!node || d > 30) return null;
          if (node.stateNode && typeof node.stateNode.selectOption === 'function') return node;
          return walkDown(node.child, d+1) || walkDown(node.sibling, d+1);
        }
        function walkUp(fiber) {
          var node = fiber;
          for (var j = 0; j < 40 && node; j++) {
            if (node.stateNode && typeof node.stateNode.selectOption === 'function') return node;
            node = node.return;
          }
          return null;
        }
        var el = input.parentElement;
        for (var i = 0; i < 12 && el; i++) {
          var key = Object.keys(el).find(function(k){ return k.startsWith('__reactFiber'); });
          if (key) {
            var fiber = el[key];
            var node = walkDown(fiber, 0) || walkUp(fiber);
            if (node) {
              var props = node.memoizedProps || node.pendingProps;
              var options = props.options || [];
              var match = options.find(function(o){ return norm(o.label) === nv; }) ||
                          options.find(function(o){ return norm(o.label).includes(nv) || nv.includes(norm(o.label)); });
              if (match) node.stateNode.selectOption(match);
              break;
            }
          }
          el = el.parentElement;
        }
      })();`;
      document.head.appendChild(script);
      script.remove();
      return true;
    }

    // Text / textarea
    const proto = field.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(field, answer); else (field as any).value = answer;
    field.dispatchEvent(new Event("input",  { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    field.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    return true;
  }, { selector, answer });
}
