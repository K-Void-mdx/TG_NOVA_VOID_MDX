import * as wa from '../../ui/wa-style.js';
const sc = wa.smallCaps;

const NOT_CONFIGURED = /no .*provider is configured/i;

/**
 * Classifies the REAL failure so the card is honest instead of a generic
 * "try again". Full details (including the provider error body) are logged to
 * Termux; users only see the classification, never internal error text.
 */
function classifyGenerationError(error) {
  const message = String(error?.message ?? '');
  if (NOT_CONFIGURED.test(message)) return 'not-configured';
  const status = message.match(/HTTP (\d{3})/)?.[1];
  if (status === '429') return 'quota';
  if (status === '401' || status === '403') return 'auth';
  if (status === '404') return 'model';
  if (status === '500' || status === '503') return 'http';
  if (status) return 'http';
  return 'unknown';
}

export function createGenerateCommand({ generation }) {
  return {
    name: 'generate',
    aliases: ['gen'],
    category: 'ai',
    usage: '.generate <image prompt>',
    description: 'Generate an image from a text prompt (requires an image provider).',
    async execute(ctx) {
      if (!ctx.argsText) {
        return ctx.reply(['⚠️ *_USAGE_*', '', '`.' + sc('generate') + ' <image prompt>`', '', wa.footer()].join('\n'));
      }
      try {
        const result = await generation.image(ctx.argsText);
        if (result?.buffer && ctx.sendMedia) {
          return ctx.sendMedia({ type: 'image', buffer: result.buffer, caption: result.caption ?? '' });
        }
        if (result?.url) return ctx.reply(result.url);
        return ctx.reply(
          [wa.header(), '', '⚠️ *_GENERATION INCOMPLETE_*', '', 'Provider returned no usable media.', '', wa.footer()].join('\n')
        );
      } catch (error) {
        // Always log the full cause (Termux only) — never hide it behind a card.
        console.error(`[GENERATE] provider error: ${error?.message ?? error}`);
        if (error?.cause) console.error(`[GENERATE] caused by: ${error.cause?.message ?? error.cause}`);

        const kind = classifyGenerationError(error);
        const provider = error?.provider ? String(error.provider) : undefined;

        const base = [wa.header(), ''];
        const footer = ['', wa.footer()];
        switch (kind) {
          case 'not-configured':
            return ctx.reply([
              ...base,
              '🧠 *_IMAGE AI NOT CONFIGURED_*',
              '',
              'No image generation provider is connected yet.',
              '',
              wa.section('STATUS'),
              wa.row('Status', 'UNAVAILABLE'),
              wa.sectionEnd(),
              ...footer,
            ].join('\n'));
          case 'quota':
            return ctx.reply([
              ...base,
              '🔴 *_IMAGE AI QUOTA EXCEEDED_*',
              '',
              'The image provider returned HTTP 429 (quota/billing exhausted).',
              'Check the provider plan and retry later.',
              '',
              wa.section('STATUS'),
              wa.row('Provider', provider ?? 'image'),
              wa.row('Status', 'QUOTA EXCEEDED'),
              wa.sectionEnd(),
              ...footer,
            ].join('\n'));
          case 'auth':
            return ctx.reply([
              ...base,
              '🔴 *_IMAGE AI AUTH FAILED_*',
              '',
              'The image provider rejected the configured credentials (HTTP 401/403).',
              '',
              wa.section('STATUS'),
              wa.row('Provider', provider ?? 'image'),
              wa.row('Status', 'INVALID CREDENTIALS'),
              wa.sectionEnd(),
              ...footer,
            ].join('\n'));
          case 'model':
            return ctx.reply([
              ...base,
              '🔴 *_IMAGE AI MODEL UNAVAILABLE_*',
              '',
              'The configured image model was not found on the provider (HTTP 404).',
              '',
              wa.section('STATUS'),
              wa.row('Provider', provider ?? 'image'),
              wa.row('Status', 'MODEL NOT FOUND'),
              wa.sectionEnd(),
              ...footer,
            ].join('\n'));
          case 'http':
            return ctx.reply([
              ...base,
              '🔴 *_IMAGE AI PROVIDER ERROR_*',
              '',
              'The image provider returned an HTTP error. Check Termux logs.',
              '',
              wa.section('STATUS'),
              wa.row('Provider', provider ?? 'image'),
              wa.row('Status', 'HTTP ERROR'),
              wa.sectionEnd(),
              ...footer,
            ].join('\n'));
          default:
            return ctx.reply([
              ...base,
              '🔴 *_IMAGE GENERATION FAILED_*',
              '',
              'The image provider is unreachable or returned an unexpected response.',
              '',
              wa.section('STATUS'),
              wa.row('Provider', provider ?? 'image'),
              wa.row('Status', 'ERROR'),
              wa.sectionEnd(),
              ...footer,
            ].join('\n'));
        }
      }
    },
  };
}