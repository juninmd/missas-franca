export type MassSchedule = {
  /** dia da semana canonico: Domingo, Segunda-feira, ... Sabado */
  day: string;
  /** horarios "HH:MM" ordenados */
  times: string[];
};

export type Chapel = {
  name: string;
  address: string | null;
  /** linhas de missa cruas (fieis a fonte) */
  massesRaw: string[];
  masses: MassSchedule[];
};

export type Parish = {
  /** id da pagina no diocesefranca.org.br */
  id: number;
  name: string;
  city: string;
  state: string;
  bairro: string | null;
  address: string | null;
  cep: string | null;
  lat: number | null;
  lon: number | null;
  phones: string[];
  email: string | null;
  site: string | null;
  /** paroco / responsavel principal */
  priest: string | null;
  /** vigarios, cooperadores, diaconos */
  clergy: string[];
  /** expediente da secretaria (linhas cruas) */
  office: string[];
  /** imagem da igreja (URL absoluta) */
  image: string | null;
  /** foto do paroco (URL absoluta) */
  priestImage: string | null;
  /** missas da matriz: estruturado p/ /hoje */
  masses: MassSchedule[];
  /** missas da matriz: linhas cruas p/ exibicao fiel (inclui especiais/votivas) */
  massesRaw: string[];
  chapels: Chapel[];
  scrapedAt: string;
  sourceUrl: string;
};

/** ordem canonica dos dias para exibicao e ordenacao */
export const WEEK_ORDER = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
] as const;
