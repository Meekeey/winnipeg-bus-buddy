"use client";
import { useEffect, useState } from "react";
import { dataSource } from "@/lib/dataSource";
import type { Place } from "@/lib/types";

type Props = {
  inputId: string;
  label: string;
  placeholder: string;
  value: Place | undefined;
  onChange: (place: Place | undefined) => void;
};

// A text box that suggests addresses and places while you type
// (uses the Winnipeg Transit Locations service).
export function PlaceInput({ inputId, label, placeholder, value, onChange }: Props) {
  const [text, setText] = useState(value ? value.label : "");
  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [problem, setProblem] = useState<string | undefined>(undefined);

  // Keep the box in step when the value is set from outside (e.g. "Home").
  useEffect(() => {
    if (value) setText(value.label);
  }, [value]);

  // Wait until typing pauses for a moment before asking the server.
  useEffect(() => {
    const query = text.trim();
    if (query.length < 3 || (value && value.label === text)) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const places = await dataSource.searchPlaces(query);
        if (!cancelled) {
          setSuggestions(places);
          setProblem(places.length === 0 ? "No matching places. Try a street number and name." : undefined);
        }
      } catch (error) {
        if (!cancelled) setProblem(error instanceof Error ? error.message : "Search failed.");
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text, value]);

  return (
    <div className="field">
      <label className="field-label" htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        className="text-input"
        type="text"
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setProblem(undefined);
          if (value) onChange(undefined);
        }}
      />
      {searching && <p className="field-note">Searching…</p>}
      {!searching && problem && !value && text.trim().length >= 3 && <p className="field-note">{problem}</p>}
      {suggestions.length > 0 && (
        <ul className="search-results">
          {suggestions.map((place, index) => (
            <li key={`${place.kind}-${place.key}-${index}`}>
              <button
                type="button"
                className="search-result"
                onClick={() => {
                  onChange(place);
                  setText(place.label);
                  setSuggestions([]);
                }}
              >
                <span className="place-kind">{place.kind}</span>
                <span className="search-result-name">{place.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
