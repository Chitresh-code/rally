"use client";

import { useState } from "react";
import type { UiCustomField, UiCustomFieldValue } from "@/lib/rally-types";
import { MUTED_FG } from "./primitives";

type Props = {
  fields: UiCustomField[];
  values: UiCustomFieldValue[];
  isGuest: boolean;
  editMode: boolean;
  onSetValue: (fieldId: string, value: string) => void;
};

export function TaskCustomFields({ fields, values, isGuest, editMode, onSetValue }: Props) {
  if (fields.length === 0) return null;
  return <div>
    <div style={{ fontSize: 11, fontWeight: 700, color: "oklch(0.55 0.01 60)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 8 }}>Custom fields</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {fields.map((field) => {
        const value = values.find((v) => v.fieldId === field.id)?.value ?? "";
        return (
          <div key={field.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 100, flex: "none", fontSize: 12.5, fontWeight: 600, color: "oklch(0.4 0.01 60)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {field.name}
            </div>
            {isGuest || !editMode ? (
              <div style={{ flex: 1, fontSize: 12.5 }}>{value || <span style={{ color: MUTED_FG }}>—</span>}</div>
            ) : field.type === "DROPDOWN" ? (
              <select
                value={value}
                onChange={(e) => onSetValue(field.id, e.target.value)}
                style={{ flex: 1, fontSize: 12.5, padding: "4px 8px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", background: "#fff", fontFamily: "inherit", cursor: "pointer" }}
              >
                <option value="">—</option>
                {field.options.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            ) : (
              <CustomFieldValueEditor
                key={field.id}
                type={field.type}
                value={value}
                onSave={(v) => onSetValue(field.id, v)}
              />
            )}
          </div>
        );
      })}
    </div>
  </div>;
}

/** Text/number/date custom-field value editor with an explicit Save button (only enabled once the draft differs from the saved value). */
function CustomFieldValueEditor({ type, value, onSave }: { type: "TEXT" | "NUMBER" | "DATE"; value: string; onSave: (v: string) => Promise<void> | void }) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const dirty = draft !== value;

  async function save() {
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flex: 1, gap: 6 }}>
      <input
        type={type === "NUMBER" ? "number" : type === "DATE" ? "date" : "text"}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && dirty && save()}
        style={{ flex: 1, fontSize: 12.5, padding: "4px 8px", borderRadius: 8, border: "1px solid oklch(0.88 0.006 60)", fontFamily: "inherit" }}
      />
      {dirty && (
        <button
          onClick={save}
          disabled={saving}
          style={{ flex: "none", fontSize: 11.5, fontWeight: 700, padding: "0 10px", borderRadius: 8, border: "none", background: "oklch(0.68 0.16 35)", color: "#fff", cursor: "pointer", opacity: saving ? 0.6 : 1 }}
        >
          Save
        </button>
      )}
    </div>
  );
}
