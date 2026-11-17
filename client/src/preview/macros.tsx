import {
  Axe,
  Bandage,
  Bomb,
  BowArrow,
  Clover,
  Compass,
  Crosshair,
  Crown,
  Eye,
  Flame,
  FlaskConical,
  Footprints,
  Ghost,
  Hammer,
  Heart,
  HeartPulse,
  Key,
  Moon,
  Pickaxe,
  ScrollText,
  Shield,
  ShieldAlert,
  ShieldPlus,
  Skull,
  Snowflake,
  Sparkles,
  Star,
  Sword,
  Swords,
  VenetianMask,
  WandSparkles,
  Zap,
  type LucideIcon
} from "lucide-react";
import type { MacroTirada } from "./tipos";

export interface IconoMacroDef {
  id: string;
  label: string;
  Icon: LucideIcon;
}

export const ICONOS_MACROS: IconoMacroDef[] = [
  { id: "sword", label: "Espada", Icon: Sword },
  { id: "swords", label: "Espadas", Icon: Swords },
  { id: "axe", label: "Hacha", Icon: Axe },
  { id: "bow", label: "Arco", Icon: BowArrow },
  { id: "hammer", label: "Martillo", Icon: Hammer },
  { id: "pickaxe", label: "Pico", Icon: Pickaxe },
  { id: "crosshair", label: "Puntería", Icon: Crosshair },
  { id: "bomb", label: "Explosivo", Icon: Bomb },
  { id: "wand", label: "Varita", Icon: WandSparkles },
  { id: "sparkles", label: "Conjuro", Icon: Sparkles },
  { id: "flame", label: "Fuego", Icon: Flame },
  { id: "zap", label: "Rayo", Icon: Zap },
  { id: "snowflake", label: "Hielo", Icon: Snowflake },
  { id: "moon", label: "Luna", Icon: Moon },
  { id: "star", label: "Estrella", Icon: Star },
  { id: "scroll", label: "Pergamino", Icon: ScrollText },
  { id: "shield", label: "Escudo", Icon: Shield },
  { id: "shield-plus", label: "Protección", Icon: ShieldPlus },
  { id: "shield-alert", label: "Bloqueo", Icon: ShieldAlert },
  { id: "heart", label: "Vida", Icon: Heart },
  { id: "heart-pulse", label: "Curación", Icon: HeartPulse },
  { id: "flask", label: "Poción", Icon: FlaskConical },
  { id: "bandage", label: "Primeros auxilios", Icon: Bandage },
  { id: "clover", label: "Suerte", Icon: Clover },
  { id: "skull", label: "Calavera", Icon: Skull },
  { id: "ghost", label: "Espectro", Icon: Ghost },
  { id: "eye", label: "Percepción", Icon: Eye },
  { id: "footprints", label: "Sigilo", Icon: Footprints },
  { id: "mask", label: "Engaño", Icon: VenetianMask },
  { id: "compass", label: "Exploración", Icon: Compass },
  { id: "key", label: "Cerradura", Icon: Key },
  { id: "crown", label: "Liderazgo", Icon: Crown }
];

const MAPA_ICONOS = new Map<string, LucideIcon>(
  ICONOS_MACROS.map((item) => [item.id, item.Icon])
);

export function IconoMacro({
  id,
  size = 15,
  className
}: {
  id: string;
  size?: number;
  className?: string;
}) {
  const Icon = MAPA_ICONOS.get(id) ?? Sword;
  return <Icon size={size} strokeWidth={2} className={className} aria-hidden="true" />;
}

const STORAGE_KEY_MACROS = "tablero_preview_macros_v1";

export function cargarMacrosLocales(): MacroTirada[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_MACROS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function guardarMacrosLocales(macros: MacroTirada[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY_MACROS, JSON.stringify(macros));
  } catch {
    // Silencioso en modo preview si localStorage falla.
  }
}
