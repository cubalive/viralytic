export type ChannelKind = 'edu' | 'music';

/** Una entrada de la biblioteca de formatos. */
export interface FormatDef {
  slug: string;
  nombre: string;
  descripcion: string;   // qué es el formato
  estructura: string;    // guía segundo a segundo
  recomendado_para: ChannelKind[];  // [] = se incluye para que el selector lo descarte
}

// ---- Briefs EDUCATIVO (informática para niños) ----
export interface BeatEdu { t: string; accion: string; texto_en_pantalla: string }
export interface BriefEdu {
  hook_0_3s: string;
  guion_por_beat: BeatEdu[];
  generadores: { frase: string[]; imagen: string[]; voz: string };
  analogia_central: string;
}
export interface SeleccionEdu { slug: string; por_que_encaja: string; brief: BriefEdu }
export interface EduResult {
  tema: string;
  seleccion: SeleccionEdu[];
  descartados: { slug: string; motivo: string }[];
}

// ---- Briefs MÚSICA (promo vertical) ----
export interface BeatMusic { t: string; accion: string; sync: string }
export interface BriefMusic {
  hook_0_5s: string;
  punto_drop_seg: number;
  guion_por_beat: BeatMusic[];
  generadores: { frase: string[]; imagen: string[]; video8s: string[] };
  loop: boolean;
}
export interface SeleccionMusic { slug: string; por_que_encaja: string; brief: BriefMusic }
export interface MusicResult {
  cancion: string;
  seleccion: SeleccionMusic[];
  descartados: { slug: string; motivo: string }[];
}
