'use client';
import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { TopBar } from '@/components/layout/top-bar';
import { HELP_ARTICLES } from '@/lib/help-articles';

interface Props {
  params: Promise<{ id: string }>;
}

export default function HelpArticlePage({ params }: Props) {
  const { id } = use(params);
  const article = HELP_ARTICLES.find((a) => a.id === id);

  if (!article) {
    return (
      <>
        <TopBar />
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-[700px] mx-auto text-center py-16">
            <h2 className="text-lg font-semibold text-text-primary mb-2">Article not found</h2>
            <p className="text-sm text-text-muted mb-4">The help article you&apos;re looking for doesn&apos;t exist.</p>
            <Link href="/help" className="text-sm text-tw-blue hover:underline">
              Back to Help Center
            </Link>
          </div>
        </div>
      </>
    );
  }

  // Find related articles in same category
  const related = HELP_ARTICLES.filter((a) => a.category === article.category && a.id !== article.id);

  return (
    <>
      <TopBar
        action={
          <Link
            href="/help"
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Help Center
          </Link>
        }
      />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[700px] mx-auto">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-xs text-text-muted mb-4">
            <Link href="/help" className="hover:text-text-primary transition-colors">Help</Link>
            <ChevronRight className="w-3 h-3" />
            <span>{article.category}</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-text-secondary">{article.title}</span>
          </div>

          {/* Article */}
          <article className="bg-card border border-card-border rounded-[14px] p-6 mb-6">
            <span className="text-[10px] uppercase tracking-wider text-tw-blue font-medium">
              {article.category}
            </span>
            <h1 className="text-xl font-semibold text-text-primary tracking-tight mt-1 mb-2">
              {article.title}
            </h1>
            <p className="text-sm text-text-muted mb-5">{article.summary}</p>

            <div className="prose-sm max-w-none">
              <HelpContent body={article.body} />
            </div>
          </article>

          {/* Related articles */}
          {related.length > 0 && (
            <div className="bg-card border border-card-border rounded-[14px] p-5">
              <h3 className="text-xs font-semibold text-text-primary mb-3">
                More in {article.category}
              </h3>
              <div className="space-y-1">
                {related.map((a) => (
                  <Link
                    key={a.id}
                    href={`/help/${a.id}`}
                    className="flex items-center gap-2 py-1.5 group"
                  >
                    <ChevronRight className="w-3 h-3 text-text-muted group-hover:text-tw-blue transition-colors" />
                    <span className="text-xs text-text-secondary group-hover:text-tw-blue transition-colors">
                      {a.title}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Simple markdown-like renderer for help article content.
 * Handles: **bold**, headers (##, ###), code blocks, lists, tables, and paragraphs.
 */
function HelpContent({ body }: { body: string }) {
  const lines = body.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <pre key={elements.length} className="bg-surface rounded-lg p-3 my-3 overflow-x-auto">
          <code className="text-xs font-mono text-text-secondary">{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // Table
    if (line.includes('|') && line.trim().startsWith('|')) {
      const tableRows: string[] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim().startsWith('|')) {
        tableRows.push(lines[i]);
        i++;
      }
      // Parse table
      const headerRow = tableRows[0];
      const dataRows = tableRows.slice(2); // skip separator row
      if (headerRow) {
        const headers = headerRow.split('|').filter(c => c.trim()).map(c => c.trim());
        elements.push(
          <div key={elements.length} className="my-3 border border-card-border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surface">
                  {headers.map((h, hi) => (
                    <th key={hi} className="text-left px-3 py-2 text-text-muted font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.map((row, ri) => {
                  const cells = row.split('|').filter(c => c.trim()).map(c => c.trim());
                  return (
                    <tr key={ri} className="border-t border-card-border">
                      {cells.map((c, ci) => (
                        <td key={ci} className="px-3 py-2 text-text-secondary">
                          <InlineText text={c} />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    // Heading
    if (line.startsWith('### ')) {
      elements.push(
        <h4 key={elements.length} className="text-xs font-semibold text-text-primary mt-4 mb-1">
          {line.slice(4)}
        </h4>
      );
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h3 key={elements.length} className="text-sm font-semibold text-text-primary mt-5 mb-2">
          {line.slice(3)}
        </h3>
      );
      i++;
      continue;
    }

    // List item
    if (line.match(/^[-*]\s/) || line.match(/^\d+\.\s/)) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].match(/^[-*]\s/) || lines[i].match(/^\d+\.\s/))) {
        items.push(lines[i].replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, ''));
        i++;
      }
      elements.push(
        <ul key={elements.length} className="my-2 space-y-1.5">
          {items.map((item, ii) => (
            <li key={ii} className="flex items-start gap-2 text-xs text-text-secondary">
              <span className="w-1 h-1 bg-tw-blue rounded-full mt-1.5 shrink-0" />
              <span><InlineText text={item} /></span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Empty line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Paragraph
    elements.push(
      <p key={elements.length} className="text-xs text-text-secondary leading-relaxed my-2">
        <InlineText text={line} />
      </p>
    );
    i++;
  }

  return <>{elements}</>;
}

/** Renders inline formatting: **bold** and `code` */
function InlineText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-medium text-text-primary">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return <code key={i} className="bg-surface px-1 py-0.5 rounded text-[10px] font-mono text-text-primary">{part.slice(1, -1)}</code>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
