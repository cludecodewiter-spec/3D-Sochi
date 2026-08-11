// schema/question.schema.json と 1:1 で対応する型
export type ChoiceKey = 'ア' | 'イ' | 'ウ' | 'エ';
export const CHOICE_KEYS: ChoiceKey[] = ['ア', 'イ', 'ウ', 'エ'];

export type Pool = 'fe-honshiken' | 'fe-menjo' | 'fe-koukai' | 'fe-sample' | 'ext-ap' | 'ext-sg';

export interface Source {
  /** 例: 出典：令和元年度 秋期 基本情報技術者試験 午前 問1 */
  label: string;
  questionPdf: string;
  answerPdf?: string;
  page: number;
  sha256?: string;
}

export interface Question {
  id: string;
  pool: Pool;
  exam: {
    year: number;
    era: string;
    season?: string;
    subject: 'kamokuA' | 'kamokuB';
    legacySection?: string;
  };
  no: number;
  category?: string;
  body: string;
  figures?: string[];
  choices: Record<ChoiceKey, string>;
  choiceFigures?: Partial<Record<ChoiceKey, string>>;
  answer: ChoiceKey;
  source: Source;
  appearances?: Source[];
  frequency?: number;
  verified: true;
  modified: false;
}

export interface QuestionIndex {
  generatedAt: string;
  totalQuestions: number;
  shards: { file: string; pool: Pool; examKey: string; label: string; count: number }[];
}

/** 試験モードの定義。実際の CBT の構成に合わせる */
export interface ExamMode {
  id: string;
  title: string;
  subtitle: string;
  questionCount: number;
  minutes: number;
  pools: Pool[];
  subject: 'kamokuA' | 'kamokuB';
}

export const EXAM_MODES: ExamMode[] = [
  {
    id: 'kamokuA-honban',
    title: '科目A試験（本番形式）',
    subtitle: '60問 / 90分',
    questionCount: 60,
    minutes: 90,
    pools: ['fe-honshiken', 'fe-menjo', 'fe-koukai', 'fe-sample'],
    subject: 'kamokuA',
  },
  {
    id: 'kamokuB-honban',
    title: '科目B試験（本番形式）',
    subtitle: '20問 / 100分',
    questionCount: 20,
    minutes: 100,
    pools: ['fe-koukai', 'fe-sample'],
    subject: 'kamokuB',
  },
  {
    id: 'menjo-shuryo',
    title: '科目A免除 修了試験形式',
    subtitle: '80問 / 150分',
    questionCount: 80,
    minutes: 150,
    pools: ['fe-menjo'],
    subject: 'kamokuA',
  },
  {
    id: 'quick10',
    title: 'クイック演習',
    subtitle: '10問 / 15分',
    questionCount: 10,
    minutes: 15,
    pools: ['fe-honshiken', 'fe-menjo', 'fe-koukai', 'fe-sample'],
    subject: 'kamokuA',
  },
];

/** 解答中の状態（1問ぶん） */
export interface AnswerState {
  selected?: ChoiceKey;
  /** 見直しチェック */
  flagged: boolean;
  /** 消し込みした選択肢 */
  struck: ChoiceKey[];
  /** マーカー範囲（body 内の文字オフセット） */
  marks: [number, number][];
}

export interface ExamResult {
  modeId: string;
  startedAt: string;
  finishedAt: string;
  elapsedSec: number;
  questionIds: string[];
  answers: Record<string, ChoiceKey | undefined>;
  /** 不正解・未解答だった問題 ID（復習モードの元データ） */
  wrongIds: string[];
  /** 分野別の正解数 / 出題数 */
  byCategory: Record<string, { correct: number; total: number }>;
  correctCount: number;
  total: number;
}
