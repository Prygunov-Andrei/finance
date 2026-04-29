import { describe, expect, it } from 'vitest';
import robots from './robots';

describe('app/robots.ts', () => {
  const result = robots();

  it('содержит sitemap и host hvac-info.com', () => {
    expect(result.sitemap).toBe('https://hvac-info.com/sitemap.xml');
    expect(result.host).toBe('https://hvac-info.com');
  });

  it('первое правило — общий *, allow / и disallow служебных путей', () => {
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
    const wildcard = rules.find((r) => r.userAgent === '*');
    expect(wildcard).toBeDefined();
    expect(wildcard!.allow).toBe('/');
    const disallow = wildcard!.disallow as string[];
    expect(disallow).toEqual(expect.arrayContaining(['/api/', '/admin/', '/erp/']));
  });

  it('содержит явные allow для GPTBot/ClaudeBot/PerplexityBot/CCBot/Yandex', () => {
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
    const allUAs = rules.flatMap((r) =>
      Array.isArray(r.userAgent) ? r.userAgent : [r.userAgent],
    );
    for (const ua of [
      'GPTBot',
      'ChatGPT-User',
      'OAI-SearchBot',
      'ClaudeBot',
      'anthropic-ai',
      'PerplexityBot',
      'Google-Extended',
      'CCBot',
      'Yandex',
    ]) {
      expect(allUAs).toContain(ua);
    }
  });

  it('каждое явное правило имеет allow / и disallow служебных путей', () => {
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
    for (const rule of rules) {
      expect(rule.allow).toBe('/');
      const disallow = rule.disallow as string[];
      expect(disallow).toEqual(expect.arrayContaining(['/api/', '/admin/', '/erp/']));
    }
  });

  it('не блокирует /_next/ — нужно для рендеринга в Яндекс/Google', () => {
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
    for (const rule of rules) {
      const disallow = rule.disallow as string[];
      expect(disallow).not.toContain('/_next/');
    }
  });
});
