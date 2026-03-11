'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, BookOpen, Users, Send, FileText, Filter, BarChart3, Settings, Code, ChevronRight } from 'lucide-react';
import { TopBar } from '@/components/layout/top-bar';
import { Input } from '@/components/ui/input';
import { HELP_ARTICLES, HELP_CATEGORIES } from '@/lib/help-articles';

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  'Getting Started': BookOpen,
  'Contacts': Users,
  'Campaigns': Send,
  'Templates': FileText,
  'Segments': Filter,
  'Reports': BarChart3,
  'Settings': Settings,
  'API': Code,
};

export default function HelpPage() {
  const [search, setSearch] = useState('');

  const filteredArticles = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    return HELP_ARTICLES.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.summary.toLowerCase().includes(q) ||
        a.body.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q)
    );
  }, [search]);

  return (
    <>
      <TopBar />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[800px] mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold text-text-primary tracking-tight mb-2">
              Help Center
            </h1>
            <p className="text-sm text-text-muted mb-5">
              Everything you need to know about using TWMail.
            </p>
            <div className="relative max-w-md mx-auto">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <Input
                placeholder="Search help articles..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-10 text-sm bg-card border-card-border"
              />
            </div>
          </div>

          {/* Search results */}
          {filteredArticles !== null ? (
            <div>
              <p className="text-xs text-text-muted mb-4">
                {filteredArticles.length} result{filteredArticles.length !== 1 ? 's' : ''} for &ldquo;{search}&rdquo;
              </p>
              {filteredArticles.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-sm text-text-muted">No articles found. Try a different search term.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredArticles.map((article) => (
                    <ArticleLink key={article.id} article={article} />
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Category grid */
            <div className="grid grid-cols-2 gap-3">
              {HELP_CATEGORIES.map((category) => {
                const Icon = CATEGORY_ICONS[category] ?? BookOpen;
                const articles = HELP_ARTICLES.filter((a) => a.category === category);
                return (
                  <div key={category} className="bg-card border border-card-border rounded-[14px] p-5">
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-tw-blue-light flex items-center justify-center">
                        <Icon className="w-4 h-4 text-tw-blue" />
                      </div>
                      <h2 className="text-sm font-semibold text-text-primary">{category}</h2>
                    </div>
                    <div className="space-y-1">
                      {articles.map((article) => (
                        <Link
                          key={article.id}
                          href={`/help/${article.id}`}
                          className="flex items-center gap-2 py-1.5 group"
                        >
                          <ChevronRight className="w-3 h-3 text-text-muted group-hover:text-tw-blue transition-colors" />
                          <span className="text-xs text-text-secondary group-hover:text-tw-blue transition-colors">
                            {article.title}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function ArticleLink({ article }: { article: (typeof HELP_ARTICLES)[number] }) {
  return (
    <Link
      href={`/help/${article.id}`}
      className="block bg-card border border-card-border rounded-xl p-4 hover:border-tw-blue/30 transition-colors"
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] uppercase tracking-wider text-tw-blue font-medium">
          {article.category}
        </span>
      </div>
      <h3 className="text-sm font-medium text-text-primary mb-0.5">{article.title}</h3>
      <p className="text-xs text-text-muted">{article.summary}</p>
    </Link>
  );
}
