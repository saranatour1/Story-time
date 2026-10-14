import { MapPinIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type Geo = { lat: number; lng: number };

type Suggestion = { key: string; label: string; name: string; context: string; geo: Geo };

// Photon (OpenStreetMap search, no key). Only an author typing a place calls
// it; people watching a story never do.
const PHOTON = "https://photon.komoot.io/";
const PHOTON_LANGS = ["en", "de", "fr", "it"];
const MIN_CHARS = 3;
const DEBOUNCE_MS = 300;

const photonResponse = z.object({
  features: z.array(
    z.object({
      geometry: z.object({ coordinates: z.array(z.number()).min(2) }),
      properties: z.object({
        osm_type: z.string().optional(),
        osm_id: z.number().optional(),
        osm_value: z.string().optional(),
        name: z.string().optional(),
        street: z.string().optional(),
        housenumber: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        country: z.string().optional(),
      }),
    }),
  ),
});

// `near` biases a search, or is the point a reverse lookup names.
const photonUrl = (path: "api" | "reverse", params: { q?: string; near?: Geo; limit: number }) => {
  const url = new URL(path, PHOTON);
  if (params.q) url.searchParams.set("q", params.q);
  url.searchParams.set("limit", String(params.limit));
  const lang = navigator.language.slice(0, 2).toLowerCase();
  if (PHOTON_LANGS.includes(lang)) url.searchParams.set("lang", lang);
  if (params.near) {
    url.searchParams.set("lat", String(params.near.lat));
    url.searchParams.set("lon", String(params.near.lng));
  }
  return url;
};

// A short name for a point (say, where a photo was taken), or undefined.
export const reversePlace = async (geo: Geo): Promise<string | undefined> => {
  try {
    // A few candidates, since the nearest is often just a postcode.
    const res = await fetch(photonUrl("reverse", { near: geo, limit: 5 }));
    return res.ok ? toSuggestions(await res.json())[0]?.label : undefined;
  } catch {
    return undefined;
  }
};

// The best match for a place someone named in words, with where it is, or
// undefined. `near` biases the search toward the trip.
export const findPlace = async (
  q: string,
  near?: Geo,
): Promise<{ label: string; geo: Geo } | undefined> => {
  try {
    const res = await fetch(photonUrl("api", { q, near, limit: 5 }));
    const best = res.ok ? toSuggestions(await res.json())[0] : undefined;
    return best && { label: best.label, geo: best.geo };
  } catch {
    return undefined;
  }
};

// A concise label ("Belém, Lisboa"), never the full address: the name, plus
// the city when it adds something. The context line is city and country.
const toSuggestions = (json: unknown): Suggestion[] => {
  const parsed = photonResponse.safeParse(json);
  if (!parsed.success) return [];
  const seen = new Set<string>();
  return parsed.data.features.flatMap((f, i) => {
    const p = f.properties;
    // A postcode isn't a place anyone would name a stop after.
    if (p.osm_value === "postcode") return [];
    // The list may show a house number; the field never gets one.
    const name = p.name ?? [p.street, p.housenumber].filter(Boolean).join(" ");
    const short = p.name ?? p.street ?? "";
    const [lng = 0, lat = 0] = f.geometry.coordinates; // GeoJSON order
    if (!short) return [];
    const city = p.city && p.city !== short ? p.city : undefined;
    const label = city && !short.includes(city) ? `${short}, ${city}` : short;
    const context = [city ?? (p.state !== name ? p.state : undefined), p.country]
      .filter(Boolean)
      .join(", ");
    if (seen.has(`${label}|${context}`)) return [];
    seen.add(`${label}|${context}`);
    return [
      { key: `${p.osm_type ?? ""}${p.osm_id ?? i}`, label, name, context, geo: { lat, lng } },
    ];
  });
};

// The "Where" field: a combobox that suggests places as you type. Picking
// one sets the place and puts the stop on the map; typing afterwards takes
// it off again, unless the location came from a photo (that's where it was
// taken, whatever it's called). Nothing is looked up on save.
export const PlaceInput = ({
  id,
  value,
  geo,
  fromPhoto = false,
  placeholder,
  getBias,
  onChange,
}: {
  id: string;
  value: string;
  geo?: Geo;
  fromPhoto?: boolean;
  placeholder?: string;
  // Where to centre the search, read when it runs.
  getBias: () => Geo | undefined;
  onChange: (place: string, geo: Geo | undefined, fromPhoto: boolean) => void;
}) => {
  const listId = useId();
  const statusId = useId();
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const request = useRef<AbortController | null>(null);
  const [options, setOptions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const optionId = (i: number) => `${listId}-${i}`;

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      request.current?.abort();
    },
    [],
  );

  // Debounced, and only the latest request counts. Failures (offline, rate
  // limits) just mean no suggestions.
  const search = (text: string) => {
    window.clearTimeout(timer.current);
    request.current?.abort();
    const q = text.trim();
    if (q.length < MIN_CHARS) {
      setOptions([]);
      setOpen(false);
      return;
    }
    timer.current = window.setTimeout(() => {
      const controller = new AbortController();
      request.current = controller;
      fetch(photonUrl("api", { q, near: getBias(), limit: 5 }), { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((json: unknown) => {
          const next = toSuggestions(json);
          setOptions(next);
          setActive(-1);
          setOpen(next.length > 0 && document.activeElement === input.current);
        })
        .catch(() => undefined);
    }, DEBOUNCE_MS);
  };

  const pick = (option: Suggestion) => {
    window.clearTimeout(timer.current);
    request.current?.abort();
    onChange(option.label, option.geo, false);
    setOptions([]);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (options.length === 0) return;
      e.preventDefault();
      setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) =>
        open ? (a + step + options.length) % options.length : step === 1 ? 0 : options.length - 1,
      );
    } else if (e.key === "Enter" && open && active >= 0) {
      // Picks the suggestion instead of submitting the form.
      e.preventDefault();
      const option = options[active];
      if (option) pick(option);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  };

  // A pin needs a name too: the server only keeps coordinates with a place.
  const named = value.trim() !== "";
  const status = geo && named ? "on" : geo ? "unnamed" : named ? "off" : null;

  return (
    <>
      <div className="relative">
        <Input
          ref={input}
          id={id}
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
          aria-describedby={status ? statusId : undefined}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            const keep = fromPhoto ? geo : undefined;
            onChange(e.target.value, keep, keep !== undefined);
            search(e.target.value);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setOpen(false)}
        />
        {/* Always in the DOM (hidden when closed), so aria-controls resolves. */}
        <div
          hidden={!open}
          className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
        >
          <ul
            id={listId}
            role="listbox"
            aria-label="Places"
            className="max-h-64 overflow-y-auto p-1"
          >
            {options.map((o, i) => (
              <li
                key={o.key}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                // Keeps focus in the input, so blur doesn't close the list first.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
                onMouseMove={() => setActive(i)}
                className={cn(
                  "cursor-pointer rounded-sm px-2 py-1.5 text-sm",
                  i === active && "bg-accent text-accent-foreground",
                )}
              >
                <span className="block truncate font-medium">{o.name}</span>
                {o.context && (
                  <span className="block truncate text-xs text-muted-foreground">{o.context}</span>
                )}
              </li>
            ))}
          </ul>
          <p className="border-t px-3 py-1 text-[11px] text-muted-foreground">
            Places from OpenStreetMap
          </p>
        </div>
      </div>
      {status === "on" ? (
        <p
          id={statusId}
          className="flex items-center gap-1 text-xs text-amber-800 dark:text-amber-200"
        >
          <MapPinIcon aria-hidden className="size-3.5" /> On the map
          {fromPhoto && <span className="text-muted-foreground">· from photo location</span>}
        </p>
      ) : status === "unnamed" ? (
        <p id={statusId} className="text-xs text-muted-foreground">
          Found where the photo was taken. Name the place to put it on the map.
        </p>
      ) : status === "off" ? (
        <p id={statusId} className="text-xs text-muted-foreground">
          Pick a suggestion to put this stop on the map
        </p>
      ) : null}
    </>
  );
};
