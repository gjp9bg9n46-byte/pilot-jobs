// CV HTML render entry point — the Preview tab + PDF export call renderCv().
import { renderApproach } from './templates/approach';
import { renderFinal } from './templates/final';
import type { CvData } from './shared';

export type { CvData };

export function renderCv(template: string, data: CvData, accentColor?: string): string {
  return template === 'final' ? renderFinal(data, accentColor) : renderApproach(data, accentColor);
}
