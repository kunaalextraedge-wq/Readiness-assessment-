import { useState, useEffect, useRef } from "react";

// ── Palette & tokens (shared Godmode system) ────────────────────────────────
const C = {
  bg:      "#080808",
  surface: "#0f0f0f",
  card:    "#131313",
  border:  "#1c1c1c",
  gold:    "#c9a84c",
  gold2:   "#e8c87a",
  goldDim: "rgba(201,168,76,0.12)",
  white:   "#f0ece4",
  dim:     "#7a7a7a",
  faint:   "#2a2a2a",
  red:     "#c0392b",
  redDim:  "rgba(192,57,43,0.10)",
  amber:   "#d4813a",
  green:   "#4a8c5c",
};

// ── Step definitions ─────────────────────────────────────────────────────────
// Each step: id, section label, render type, and (for flag steps) which
// answers trigger a soft-stop. Nothing here maps an answer to a compound,
// dose, or protocol — only to "continue" or "route to consult."
const SECTIONS = [
  { id: "profile",   label: "Profile",          icon: "◉" },
  { id: "history",   label: "Cycle History",    icon: "◈" },
  { id: "health",    label: "Health Screening", icon: "◍" },
  { id: "goal",      label: "Goal & Interest",  icon: "◐" },
];

const STEPS = [
  // ── PROFILE ──
  { section: "profile", type: "text3", key: "bio",
    q: "Let's start with the basics.",
    fields: [
      { key: "age", label: "Age", placeholder: "e.g. 27", numeric: true },
      { key: "height", label: "Height (cm)", placeholder: "e.g. 178", numeric: true },
      { key: "weight", label: "Weight (kg)", placeholder: "e.g. 82", numeric: true },
    ],
  },
  { section: "profile", type: "single", key: "trainingAge",
    q: "How long have you been training seriously?",
    opts: [
      "Under 1 year",
      "1–3 years",
      "3–6 years",
      "6+ years",
    ],
  },

  // ── CYCLE HISTORY ──
  { section: "history", type: "single", key: "firstCycle",
    q: "Is this your first time considering a cycle?",
    opts: ["Yes, first time", "No, I've run cycles before"],
  },
  { section: "history", type: "single", key: "priorCycles",
    q: "How many cycles have you run in total?",
    opts: ["1–2", "3–5", "6+"],
    showIf: (a) => a.firstCycle === "No, I've run cycles before",
  },
  { section: "history", type: "single", key: "lastCycleGap",
    q: "How long since your last cycle ended?",
    opts: ["Currently on / just finished", "1–6 months", "6–12 months", "1+ years"],
    showIf: (a) => a.firstCycle === "No, I've run cycles before",
  },
  { section: "history", type: "single", key: "pctDone",
    q: "Did you run a proper PCT (post-cycle therapy) after your last cycle?",
    opts: ["Yes, full PCT", "Partial / unsure", "No"],
    showIf: (a) => a.firstCycle === "No, I've run cycles before",
  },

  // ── HEALTH SCREENING ──
  { section: "health", type: "single", key: "bloodwork",
    q: "Have you had bloodwork done in the last 3 months?",
    opts: [
      "Yes, full panel (lipids, liver, hormones)",
      "Yes, but basic / partial panel only",
      "No, not recently",
      "Never had bloodwork done",
    ],
  },
  { section: "health", type: "single", key: "bloodPressure",
    q: "How would you describe your blood pressure?",
    opts: [
      "Normal, checked recently",
      "Borderline / elevated",
      "Diagnosed high BP — managed with medication",
      "Diagnosed high BP — not currently managed",
      "I don't know",
    ],
    flagIf: (v) => v === "Diagnosed high BP — not currently managed" || v === "I don't know",
  },
  { section: "health", type: "single", key: "cardiac",
    q: "Any history of heart conditions — yours or immediate family?",
    opts: [
      "None that I know of",
      "Family history, but I've never been screened",
      "I've been screened and cleared",
      "Personal diagnosis (arrhythmia, enlarged heart, prior event, etc.)",
    ],
    flagIf: (v) => v === "Personal diagnosis (arrhythmia, enlarged heart, prior event, etc.)",
  },
  { section: "health", type: "multi", key: "otherConditions",
    q: "Do any of these apply to you?",
    opts: [
      "Liver or kidney issues",
      "Thyroid condition",
      "Diabetes / blood sugar issues",
      "History of mental health conditions (mood, anxiety, depression)",
      "Currently on prescription medication",
      "None of the above",
    ],
    exclusive: "None of the above",
    flagIf: (vals) => vals && vals.length > 0 && !vals.includes("None of the above"),
  },
  { section: "health", type: "single", key: "age18",
    q: "Are you 21 or older?",
    opts: ["Yes", "No"],
    flagIf: (v) => v === "No",
    hardStop: true,
  },

  // ── GOAL & INTEREST ──
  { section: "goal", type: "single", key: "goal",
    q: "What's the primary goal right now?",
    opts: [
      "Cut — lose fat, keep muscle",
      "Lean gain — build size with minimal fat",
      "Bilkul bulk — maximum mass, less concerned about fat",
      "Recomposition — lose fat and gain muscle at once",
    ],
  },
  { section: "goal", type: "single", key: "interest",
    q: "What are you looking to explore?",
    opts: [
      "Steroids only",
      "SARMs only",
      "Peptides only",
      "Full stack — steroids + SARMs + peptides",
      "Not sure yet — want guidance first",
    ],
  },
];

const TOTAL_STEPS = STEPS.length;

// ── Helpers ──────────────────────────────────────────────────────────────────
function visibleSteps(answers) {
  return STEPS.filter((s) => !s.showIf || s.showIf(answers));
}

function computeFlags(answers) {
  const flags = [];
  STEPS.forEach((s) => {
    if (!s.flagIf) return;
    const v = answers[s.key];
    if (v === undefined) return;
    if (s.flagIf(v)) flags.push(s);
  });
  return flags;
}

function hasHardStop(answers) {
  return STEPS.some((s) => s.hardStop && s.flagIf && s.flagIf(answers[s.key]));
}

// ── Shared UI atoms ──────────────────────────────────────────────────────────
function GoldBar() {
  return (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0, height: 3,
      background: `linear-gradient(90deg, ${C.gold} 0%, ${C.gold2} 50%, ${C.gold} 100%)`,
    }} />
  );
}

function RedBar() {
  return (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0, height: 3,
      background: `linear-gradient(90deg, ${C.red} 0%, #e0665a 50%, ${C.red} 100%)`,
    }} />
  );
}

function Grain() {
  return (
    <div style={{
      position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, opacity: 0.025,
      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
      backgroundSize: "256px",
    }} />
  );
}

function useTypewriter(text, speed = 20, active = true) {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    if (!active) { setDisplayed(text); return; }
    setDisplayed("");
    let i = 0;
    const t = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(t);
    }, speed);
    return () => clearInterval(t);
  }, [text, active]);
  return displayed;
}

// ── Screens ───────────────────────────────────────────────────────────────────
function IntroScreen({ onStart }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), 100); return () => clearTimeout(t); }, []);

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "40px 20px",
      opacity: visible ? 1 : 0, transition: "opacity 0.8s ease",
    }}>
      <div style={{
        width: "100%", maxWidth: 520,
        background: C.surface, border: `1px solid ${C.border}`,
        position: "relative", overflow: "hidden",
        boxShadow: "0 40px 100px rgba(0,0,0,0.8)",
      }}>
        <GoldBar />
        <div style={{ padding: "52px 44px 44px" }}>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 36 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.gold }} />
            <span style={{
              fontFamily: "sans-serif", fontSize: 11, color: C.gold,
              letterSpacing: "0.3em", textTransform: "uppercase", fontWeight: 700,
            }}>KUNAAL · Readiness Screening</span>
          </div>

          <div style={{ fontFamily: "Georgia, serif", fontSize: 36, color: C.white, lineHeight: 1.15, marginBottom: 10 }}>
            The Compound
          </div>
          <div style={{ fontFamily: "Georgia, serif", fontSize: 36, color: C.gold, lineHeight: 1.15, marginBottom: 28 }}>
            Readiness Check.
          </div>

          <div style={{ width: 40, height: 1, background: C.gold, marginBottom: 24 }} />

          <p style={{
            fontFamily: "sans-serif", fontSize: 15, color: C.dim, lineHeight: 1.75,
            margin: "0 0 24px",
          }}>
            Before any protocol conversation, we assess where you
            actually stand — training history, bloodwork, cardiovascular
            profile, and goals. <em style={{ color: C.white }}>This is a screening,
            not a prescription</em> — your results and cycle design happen
            with Kunaal directly, one-to-one.
          </p>

          <div style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderLeft: `3px solid ${C.gold}`, padding: "14px 18px", marginBottom: 32,
          }}>
            <p style={{ fontFamily: "sans-serif", fontSize: 12.5, color: C.dim, lineHeight: 1.6, margin: 0 }}>
              No doses, compounds, or protocols are generated here.
              This tool only determines whether you're a safe candidate
              to move to a real conversation.
            </p>
          </div>

          <div style={{ display: "flex", gap: 24, marginBottom: 40, paddingTop: 24, borderTop: `1px solid ${C.border}` }}>
            {[["12", "Questions"], ["4", "Sections"], ["2", "Minutes"], ["Private", "Results"]].map(([a,b]) => (
              <div key={b}>
                <div style={{ fontFamily: "Georgia, serif", fontSize: 20, color: C.white }}>{a}</div>
                <div style={{ fontFamily: "sans-serif", fontSize: 10, color: C.dim, letterSpacing: "0.12em", textTransform: "uppercase" }}>{b}</div>
              </div>
            ))}
          </div>

          <button onClick={onStart} style={{
            width: "100%", padding: "18px 0",
            background: "transparent", border: `1.5px solid ${C.gold}`,
            color: C.gold, fontFamily: "sans-serif", fontSize: 13,
            letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700,
            cursor: "pointer", transition: "background 0.25s, color 0.25s",
          }}
            onMouseEnter={e => { e.currentTarget.style.background = C.goldDim; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
          >
            Begin Screening →
          </button>

          <div style={{ marginTop: 24, display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: C.faint }} />
            <span style={{ fontFamily: "sans-serif", fontSize: 10, color: C.faint, letterSpacing: "0.15em" }}>
              @kunaal_thechamp
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepScreen({ step, index, total, answers, onAnswer, onNext, canAdvance }) {
  const section = SECTIONS.find((s) => s.id === step.section);
  const progress = (index / total) * 100;
  const [entered, setEntered] = useState(false);
  useEffect(() => { setEntered(false); const t = setTimeout(() => setEntered(true), 60); return () => clearTimeout(t); }, [step.key]);

  const val = answers[step.key];

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "40px 20px",
    }}>
      <div style={{
        width: "100%", maxWidth: 560,
        opacity: entered ? 1 : 0, transform: entered ? "translateY(0)" : "translateY(12px)",
        transition: "opacity 0.35s ease, transform 0.35s ease",
      }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontFamily: "sans-serif", fontSize: 11, color: C.dim, letterSpacing: "0.15em", textTransform: "uppercase" }}>
              {section.icon} {section.label}
            </span>
            <span style={{ fontFamily: "sans-serif", fontSize: 11, color: C.dim, letterSpacing: "0.1em" }}>
              {index + 1} of {total}
            </span>
          </div>
          <div style={{ height: 2, background: C.faint, borderRadius: 1 }}>
            <div style={{
              height: "100%", borderRadius: 1,
              width: `${progress}%`,
              background: `linear-gradient(90deg, ${C.gold}, ${C.gold2})`,
              transition: "width 0.5s ease",
            }} />
          </div>
        </div>

        <div style={{
          background: C.surface, border: `1px solid ${C.border}`,
          position: "relative", overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        }}>
          <GoldBar />
          <div style={{ padding: "40px 36px 36px" }}>

            <div style={{
              fontFamily: "Georgia, serif", fontSize: 20, color: C.white,
              lineHeight: 1.5, marginBottom: 32,
            }}>
              {step.q}
            </div>

            {step.type === "text3" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 8 }}>
                {step.fields.map((f) => (
                  <div key={f.key}>
                    <label style={{
                      display: "block", fontFamily: "sans-serif", fontSize: 11,
                      color: C.dim, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8,
                    }}>{f.label}</label>
                    <input
                      type={f.numeric ? "number" : "text"}
                      placeholder={f.placeholder}
                      value={(val && val[f.key]) || ""}
                      onChange={(e) => onAnswer(step.key, { ...(val || {}), [f.key]: e.target.value })}
                      style={{
                        width: "100%", boxSizing: "border-box",
                        background: C.card, border: `1px solid ${C.border}`,
                        color: C.white, fontFamily: "sans-serif", fontSize: 15,
                        padding: "14px 16px", outline: "none",
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = C.gold; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = C.border; }}
                    />
                  </div>
                ))}
              </div>
            )}

            {step.type === "single" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {step.opts.map((opt, i) => {
                  const selected = val === opt;
                  return (
                    <button key={i} onClick={() => onAnswer(step.key, opt)} style={{
                      textAlign: "left", padding: "14px 18px",
                      background: selected ? C.goldDim : "transparent",
                      border: `1px solid ${selected ? C.gold : C.border}`,
                      color: selected ? C.white : C.dim,
                      fontFamily: "sans-serif", fontSize: 14, lineHeight: 1.5,
                      cursor: "pointer", transition: "all 0.18s ease",
                      display: "flex", alignItems: "flex-start", gap: 12,
                    }}
                      onMouseEnter={e => { if (!selected) { e.currentTarget.style.borderColor = "#333"; e.currentTarget.style.color = C.white; }}}
                      onMouseLeave={e => { if (!selected) { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.dim; }}}
                    >
                      <span style={{
                        flexShrink: 0, width: 20, height: 20,
                        border: `1.5px solid ${selected ? C.gold : "#333"}`,
                        borderRadius: "50%", marginTop: 2,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {selected && <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.gold, display: "block" }} />}
                      </span>
                      <span>{opt}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {step.type === "multi" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {step.opts.map((opt, i) => {
                  const list = val || [];
                  const selected = list.includes(opt);
                  return (
                    <button key={i} onClick={() => {
                      let next;
                      if (opt === step.exclusive) {
                        next = selected ? [] : [step.exclusive];
                      } else {
                        const withoutExclusive = list.filter((x) => x !== step.exclusive);
                        next = selected ? withoutExclusive.filter((x) => x !== opt) : [...withoutExclusive, opt];
                      }
                      onAnswer(step.key, next);
                    }} style={{
                      textAlign: "left", padding: "14px 18px",
                      background: selected ? C.goldDim : "transparent",
                      border: `1px solid ${selected ? C.gold : C.border}`,
                      color: selected ? C.white : C.dim,
                      fontFamily: "sans-serif", fontSize: 14, lineHeight: 1.5,
                      cursor: "pointer", transition: "all 0.18s ease",
                      display: "flex", alignItems: "flex-start", gap: 12,
                    }}
                      onMouseEnter={e => { if (!selected) { e.currentTarget.style.borderColor = "#333"; e.currentTarget.style.color = C.white; }}}
                      onMouseLeave={e => { if (!selected) { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.dim; }}}
                    >
                      <span style={{
                        flexShrink: 0, width: 20, height: 20,
                        border: `1.5px solid ${selected ? C.gold : "#333"}`,
                        borderRadius: 4, marginTop: 2,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {selected && <span style={{ width: 8, height: 8, background: C.gold, display: "block" }} />}
                      </span>
                      <span>{opt}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div style={{ marginTop: 32 }}>
              <button
                disabled={!canAdvance}
                onClick={onNext}
                style={{
                  width: "100%", padding: "16px 0",
                  background: canAdvance ? C.gold : C.faint,
                  border: "none", cursor: canAdvance ? "pointer" : "not-allowed",
                  fontFamily: "sans-serif", fontSize: 12, fontWeight: 700,
                  color: canAdvance ? C.bg : C.dim, letterSpacing: "0.2em", textTransform: "uppercase",
                  transition: "opacity 0.2s",
                }}
              >
                Continue →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StopScreen({ reason, onRestart }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), 100); return () => clearTimeout(t); }, []);
  const headline = useTypewriter(reason.headline, 25, visible);

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "40px 20px",
      opacity: visible ? 1 : 0, transition: "opacity 0.7s ease",
    }}>
      <div style={{
        width: "100%", maxWidth: 540,
        background: C.surface, border: `1px solid ${C.border}`,
        position: "relative", overflow: "hidden",
        boxShadow: "0 40px 100px rgba(0,0,0,0.8)",
      }}>
        <RedBar />
        <div style={{ padding: "48px 40px" }}>

          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "4px 12px", border: `1px solid ${C.red}`, marginBottom: 20,
          }}>
            <span style={{ fontFamily: "sans-serif", fontSize: 11, color: C.red, letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700 }}>
              NOT YET CLEARED
            </span>
          </div>

          <div style={{ fontFamily: "Georgia, serif", fontSize: 24, color: C.white, lineHeight: 1.4, marginBottom: 24, minHeight: 64 }}>
            {headline}
          </div>

          <div style={{ background: C.card, borderLeft: `3px solid ${C.red}`, padding: "18px 22px", marginBottom: 24 }}>
            <p style={{ fontFamily: "sans-serif", fontSize: 14, color: C.dim, lineHeight: 1.75, margin: 0 }}>
              {reason.body}
            </p>
          </div>

          <p style={{ fontFamily: "sans-serif", fontSize: 13, color: C.dim, lineHeight: 1.7, margin: "0 0 32px" }}>
            This isn't a rejection — it's the screening doing its job.
            Get this addressed, and you're welcome to come back through
            this check whenever you're ready.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button style={{
              padding: "16px 0", width: "100%",
              background: C.gold, border: "none", cursor: "pointer",
              fontFamily: "sans-serif", fontSize: 12, fontWeight: 700,
              color: C.bg, letterSpacing: "0.2em", textTransform: "uppercase",
            }}>
              DM @kunaal_thechamp for Guidance
            </button>
            <button onClick={onRestart} style={{
              padding: "14px 0", width: "100%",
              background: "transparent", border: `1px solid ${C.border}`,
              cursor: "pointer", fontFamily: "sans-serif", fontSize: 12,
              color: C.dim, letterSpacing: "0.15em", textTransform: "uppercase",
            }}>
              Retake Screening
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ContactScreen({ answers, contact, onChange, onSend }) {
  const [entered, setEntered] = useState(false);
  useEffect(() => { const t = setTimeout(() => setEntered(true), 60); return () => clearTimeout(t); }, []);

  const valid =
    contact.name.trim() !== "" &&
    contact.phone.trim() !== "" &&
    /\S+@\S+\.\S+/.test(contact.email);

  const fields = [
    { key: "name", label: "Full Name", placeholder: "e.g. Rahul Sharma", type: "text" },
    { key: "email", label: "Email", placeholder: "e.g. rahul@email.com", type: "email" },
    { key: "phone", label: "Phone (with country code)", placeholder: "e.g. +91 98765 43210", type: "tel" },
  ];

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "40px 20px",
      opacity: entered ? 1 : 0, transition: "opacity 0.4s ease",
    }}>
      <div style={{ width: "100%", maxWidth: 560 }}>
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`,
          position: "relative", overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        }}>
          <GoldBar />
          <div style={{ padding: "40px 36px 36px" }}>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.gold }} />
              <span style={{ fontFamily: "sans-serif", fontSize: 11, color: C.gold, letterSpacing: "0.25em", textTransform: "uppercase", fontWeight: 700 }}>
                LAST STEP
              </span>
            </div>

            <div style={{ fontFamily: "Georgia, serif", fontSize: 20, color: C.white, lineHeight: 1.5, marginBottom: 12 }}>
              Where should Kunaal send your results?
            </div>
            <p style={{ fontFamily: "sans-serif", fontSize: 13, color: C.dim, lineHeight: 1.7, margin: "0 0 28px" }}>
              This opens a message from your own phone or inbox — nothing is
              stored on our end. You're in control of what gets sent.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 8 }}>
              {fields.map((f) => (
                <div key={f.key}>
                  <label style={{
                    display: "block", fontFamily: "sans-serif", fontSize: 11,
                    color: C.dim, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8,
                  }}>{f.label}</label>
                  <input
                    type={f.type}
                    placeholder={f.placeholder}
                    value={contact[f.key]}
                    onChange={(e) => onChange(f.key, e.target.value)}
                    style={{
                      width: "100%", boxSizing: "border-box",
                      background: C.card, border: `1px solid ${C.border}`,
                      color: C.white, fontFamily: "sans-serif", fontSize: 15,
                      padding: "14px 16px", outline: "none",
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = C.gold; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = C.border; }}
                  />
                </div>
              ))}
            </div>

            <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                disabled={!valid}
                onClick={() => onSend("whatsapp")}
                style={{
                  width: "100%", padding: "16px 0",
                  background: valid ? C.gold : C.faint,
                  border: "none", cursor: valid ? "pointer" : "not-allowed",
                  fontFamily: "sans-serif", fontSize: 12, fontWeight: 700,
                  color: valid ? C.bg : C.dim, letterSpacing: "0.2em", textTransform: "uppercase",
                }}
              >
                Send via WhatsApp DM →
              </button>
              <button
                disabled={!valid}
                onClick={() => onSend("email")}
                style={{
                  width: "100%", padding: "14px 0",
                  background: "transparent", border: `1px solid ${valid ? C.gold : C.border}`,
                  cursor: valid ? "pointer" : "not-allowed",
                  fontFamily: "sans-serif", fontSize: 12,
                  color: valid ? C.gold : C.dim, letterSpacing: "0.15em", textTransform: "uppercase",
                }}
              >
                Send via Email Instead
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultScreen({ answers, flags, onRestart }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), 100); return () => clearTimeout(t); }, []);
  const headline = useTypewriter("You're cleared to start the conversation.", 25, visible);

  const hasSoftFlags = flags.length > 0;

  const profileLine = [
    answers.bio?.age ? `${answers.bio.age}y` : null,
    answers.bio?.height ? `${answers.bio.height}cm` : null,
    answers.bio?.weight ? `${answers.bio.weight}kg` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", padding: "40px 20px 80px",
      opacity: visible ? 1 : 0, transition: "opacity 0.7s ease",
    }}>
      <div style={{ width: "100%", maxWidth: 560 }}>

        <div style={{
          background: C.surface, border: `1px solid ${C.border}`,
          position: "relative", overflow: "hidden",
          boxShadow: "0 40px 100px rgba(0,0,0,0.8)", marginBottom: 16,
        }}>
          <GoldBar />
          <div style={{ padding: "48px 40px 40px" }}>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.green }} />
              <span style={{ fontFamily: "sans-serif", fontSize: 11, color: C.green, letterSpacing: "0.25em", textTransform: "uppercase", fontWeight: 700 }}>
                SCREENING COMPLETE
              </span>
            </div>

            <div style={{ fontFamily: "Georgia, serif", fontSize: 24, color: C.white, lineHeight: 1.4, marginBottom: 28, minHeight: 64 }}>
              {headline}
            </div>

            {/* Profile recap */}
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 24, marginBottom: 24 }}>
              <div style={{ fontFamily: "sans-serif", fontSize: 10, color: C.dim, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 12 }}>
                YOUR PROFILE
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 24px", fontFamily: "sans-serif", fontSize: 13, color: C.white }}>
                {profileLine && <span>{profileLine}</span>}
                {answers.trainingAge && <span>{answers.trainingAge} training</span>}
                {answers.goal && <span>{answers.goal.split(" — ")[0]}</span>}
                {answers.interest && <span>{answers.interest}</span>}
              </div>
            </div>

            {hasSoftFlags && (
              <div style={{ background: C.card, borderLeft: `3px solid ${C.amber}`, padding: "16px 20px", marginBottom: 8 }}>
                <div style={{ fontFamily: "sans-serif", fontSize: 10, color: C.amber, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 8, fontWeight: 700 }}>
                  FLAGGED FOR DISCUSSION
                </div>
                <p style={{ fontFamily: "sans-serif", fontSize: 13, color: C.dim, lineHeight: 1.7, margin: 0 }}>
                  A few of your answers need a closer look before anything is
                  designed — nothing disqualifying, but Kunaal will want to
                  go through these with you directly.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* CTA card */}
        <div style={{
          background: C.surface, border: `1px solid ${C.gold}`,
          position: "relative", overflow: "hidden",
        }}>
          <div style={{ height: 3, background: `linear-gradient(90deg, ${C.gold}, ${C.gold2}, ${C.gold})` }} />
          <div style={{ padding: "36px 40px" }}>
            <div style={{ fontFamily: "sans-serif", fontSize: 10, color: C.gold, letterSpacing: "0.25em", textTransform: "uppercase", fontWeight: 700, marginBottom: 16 }}>
              NEXT STEP
            </div>
            <p style={{ fontFamily: "Georgia, serif", fontSize: 17, color: C.white, lineHeight: 1.6, margin: "0 0 24px" }}>
              Your screening is sent directly to Kunaal. Compound
              selection, dosing, and cycle design happen in a real
              conversation — never automatically.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button style={{
                padding: "16px 0", width: "100%",
                background: C.gold, border: "none", cursor: "pointer",
                fontFamily: "sans-serif", fontSize: 12, fontWeight: 700,
                color: C.bg, letterSpacing: "0.2em", textTransform: "uppercase",
              }}>
                DM @kunaal_thechamp to Continue
              </button>
              <button onClick={onRestart} style={{
                padding: "14px 0", width: "100%",
                background: "transparent", border: `1px solid ${C.border}`,
                cursor: "pointer", fontFamily: "sans-serif", fontSize: 12,
                color: C.dim, letterSpacing: "0.15em", textTransform: "uppercase",
              }}>
                Retake Screening
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
const KUNAAL_WHATSAPP_NUMBER = "919011101654"; // Kunaal's WhatsApp — country code + number, no + or spaces
const KUNAAL_EMAIL = "kunaalextraedge@gmail.com"; // Kunaal's email

function buildSummary(answers, contact) {
  const lines = [
    `Readiness Screening — ${contact.name}`,
    `Phone: ${contact.phone}`,
    `Email: ${contact.email}`,
    "",
    `Age/Height/Weight: ${answers.bio?.age || "-"}y / ${answers.bio?.height || "-"}cm / ${answers.bio?.weight || "-"}kg`,
    `Training age: ${answers.trainingAge || "-"}`,
    `First cycle: ${answers.firstCycle || "-"}`,
  ];
  if (answers.priorCycles) lines.push(`Prior cycles: ${answers.priorCycles}`);
  if (answers.lastCycleGap) lines.push(`Last cycle ended: ${answers.lastCycleGap}`);
  if (answers.pctDone) lines.push(`PCT done: ${answers.pctDone}`);
  lines.push(
    `Bloodwork: ${answers.bloodwork || "-"}`,
    `Blood pressure: ${answers.bloodPressure || "-"}`,
    `Cardiac history: ${answers.cardiac || "-"}`,
    `Other conditions: ${(answers.otherConditions || []).join(", ") || "-"}`,
    `Goal: ${answers.goal || "-"}`,
    `Interest: ${answers.interest || "-"}`,
  );
  return lines.join("\n");
}

export default function App() {
  const [screen, setScreen] = useState("intro"); // intro | quiz | stop | contact | result
  const [stepIdx, setStepIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [stopReason, setStopReason] = useState(null);
  const [contact, setContact] = useState({ name: "", email: "", phone: "" });
  const containerRef = useRef(null);

  const steps = visibleSteps(answers);
  const currentStep = steps[stepIdx];

  const handleStart = () => {
    setAnswers({});
    setStepIdx(0);
    setStopReason(null);
    setContact({ name: "", email: "", phone: "" });
    setScreen("quiz");
  };

  const handleAnswer = (key, value) => {
    setAnswers((a) => ({ ...a, [key]: value }));
  };

  const handleContactChange = (key, value) => {
    setContact((c) => ({ ...c, [key]: value }));
  };

  const handleSend = (channel) => {
    const summary = buildSummary(answers, contact);
    if (channel === "whatsapp") {
      const url = `https://wa.me/${KUNAAL_WHATSAPP_NUMBER}?text=${encodeURIComponent(summary)}`;
      window.open(url, "_blank");
    } else {
      const subject = encodeURIComponent(`Readiness Screening — ${contact.name}`);
      const body = encodeURIComponent(summary);
      window.location.href = `mailto:${KUNAAL_EMAIL}?subject=${subject}&body=${body}`;
    }
    setScreen("result");
    containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const canAdvance = () => {
    if (!currentStep) return false;
    const v = answers[currentStep.key];
    if (currentStep.type === "text3") {
      return currentStep.fields.every((f) => v && v[f.key] && String(v[f.key]).trim() !== "");
    }
    if (currentStep.type === "multi") return v && v.length > 0;
    return v !== undefined && v !== "";
  };

  const handleNext = () => {
    // Hard stop: age gate
    if (currentStep.hardStop && currentStep.flagIf(answers[currentStep.key])) {
      setStopReason({
        headline: "This assessment is for adults 21 and over.",
        body: "Compound use carries real health risk, and we only work with clients above this age threshold. Come back once you meet it.",
      });
      setScreen("stop");
      return;
    }
    // Soft stop: uncontrolled BP or personal cardiac diagnosis end the flow early
    if (currentStep.key === "bloodPressure" && answers.bloodPressure === "Diagnosed high BP — not currently managed") {
      setStopReason({
        headline: "Uncontrolled blood pressure needs medical attention first.",
        body: "Compounds place additional load on the cardiovascular system. With BP that isn't currently managed, the responsible next step is your doctor, not a cycle — get it under control, then come back through this check.",
      });
      setScreen("stop");
      return;
    }
    if (currentStep.key === "cardiac" && answers.cardiac === "Personal diagnosis (arrhythmia, enlarged heart, prior event, etc.)") {
      setStopReason({
        headline: "A personal cardiac history changes the risk calculation entirely.",
        body: "This isn't something to screen past — it needs sign-off from your cardiologist before any compound conversation happens, full stop.",
      });
      setScreen("stop");
      return;
    }

    const nextSteps = visibleSteps(answers);
    if (stepIdx < nextSteps.length - 1) {
      setStepIdx(stepIdx + 1);
      containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      setScreen("contact");
      containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const flags = computeFlags(answers);

  return (
    <div
      ref={containerRef}
      style={{
        minHeight: "100vh", background: C.bg, fontFamily: "Georgia, serif",
        position: "relative", overflowY: "auto",
      }}
    >
      <Grain />
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, height: 3,
        background: screen === "stop"
          ? `linear-gradient(90deg, ${C.red} 0%, #e0665a 50%, ${C.red} 100%)`
          : `linear-gradient(90deg, ${C.gold} 0%, ${C.gold2} 50%, ${C.gold} 100%)`,
      }} />

      <div style={{ position: "relative", zIndex: 1 }}>
        {screen === "intro" && <IntroScreen onStart={handleStart} />}
        {screen === "quiz" && currentStep && (
          <StepScreen
            step={currentStep}
            index={stepIdx}
            total={steps.length}
            answers={answers}
            onAnswer={handleAnswer}
            onNext={handleNext}
            canAdvance={canAdvance()}
          />
        )}
        {screen === "stop" && stopReason && <StopScreen reason={stopReason} onRestart={handleStart} />}
        {screen === "contact" && (
          <ContactScreen
            answers={answers}
            contact={contact}
            onChange={handleContactChange}
            onSend={handleSend}
          />
        )}
        {screen === "result" && <ResultScreen answers={answers} flags={flags} onRestart={handleStart} />}
      </div>

      {screen !== "intro" && (
        <button onClick={handleStart} style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 100,
          background: C.card, border: `1px solid ${C.border}`,
          color: C.dim, fontFamily: "sans-serif", fontSize: 11,
          letterSpacing: "0.15em", textTransform: "uppercase",
          padding: "10px 16px", cursor: "pointer",
        }}>
          ↺ Restart
        </button>
      )}
    </div>
  );
}
