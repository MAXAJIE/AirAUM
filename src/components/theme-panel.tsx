import { ACCENTS, useTheme, type Density, type ThemeMode } from "@/components/theme-provider";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";

const MODES: { id: ThemeMode; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

const DENSITIES: { id: Density; label: string }[] = [
  { id: "compact", label: "Compact" },
  { id: "comfortable", label: "Comfortable" },
  { id: "spacious", label: "Spacious" },
];

export function ThemePanel() {
  const theme = useTheme();

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>Appearance</Label>
        <div className="grid grid-cols-3 gap-2">
          {MODES.map((m) => (
            <Button
              key={m.id}
              size="sm"
              variant={theme.mode === m.id ? "default" : "outline"}
              onClick={() => theme.setMode(m.id)}
            >
              {m.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Accent colour</Label>
        <div className="flex flex-wrap gap-2">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              aria-label={a.label}
              onClick={() => theme.setAccent(a.id)}
              className={`size-7 rounded-full border-2 transition ${
                theme.accent === a.id ? "border-foreground" : "border-transparent"
              }`}
              style={{ backgroundColor: `oklch(0.62 ${a.chroma} ${a.hue})` }}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Spacing</Label>
        <div className="grid grid-cols-3 gap-2">
          {DENSITIES.map((d) => (
            <Button
              key={d.id}
              size="sm"
              variant={theme.density === d.id ? "default" : "outline"}
              onClick={() => theme.setDensity(d.id)}
            >
              {d.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Corner roundness</Label>
        <Slider
          value={[theme.radius]}
          min={0}
          max={1.5}
          step={0.05}
          onValueChange={([v]) => theme.setRadius(v ?? 0.75)}
        />
      </div>

      <Button variant="ghost" size="sm" onClick={theme.reset}>
        Reset to defaults
      </Button>
    </div>
  );
}
