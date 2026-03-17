'use client';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { Editor } from 'grapesjs';
import grapesjs from 'grapesjs';
import mjml from 'grapesjs-mjml';
import { Monitor, Smartphone, Eye, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface GrapesEditorRef {
  getHtml: () => string;
  getJson: () => string;
}

interface GrapesEditorProps {
  initialContent?: string;
  onChange?: (html: string, json: string) => void;
  onSave?: () => void;
  saving?: boolean;
}

export const GrapesEditor = forwardRef<GrapesEditorRef, GrapesEditorProps>(
  function GrapesEditor({ initialContent, onChange, onSave, saving }, ref) {
    const editorRef = useRef<Editor | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
    const [preview, setPreview] = useState(false);
    const [ready, setReady] = useState(false);

    useImperativeHandle(ref, () => ({
      getHtml: () => {
        if (!editorRef.current) return '';
        const result = editorRef.current.runCommand('mjml-code-to-html') as {
          html: string;
          errors: Array<{ formattedMessage: string }>;
        };
        if (result.errors?.length > 0) {
          console.warn('MJML compile warnings:', result.errors.map((e) => e.formattedMessage));
        }
        return result.html ?? '';
      },
      getJson: () => {
        if (!editorRef.current) return '{}';
        return JSON.stringify(editorRef.current.getProjectData());
      },
    }));

    useEffect(() => {
      if (!containerRef.current || editorRef.current) return;

      const editor = grapesjs.init({
        container: containerRef.current,
        height: '100%',
        width: 'auto',
        storageManager: false,
        plugins: [mjml],
        deviceManager: {
          devices: [
            { name: 'Desktop', width: '' },
            { name: 'Mobile portrait', width: '375px' },
          ],
        },
      });

      editorRef.current = editor;

      // Load initial content if provided
      if (initialContent) {
        try {
          const parsed = JSON.parse(initialContent);
          if (parsed && typeof parsed === 'object' && (parsed.pages || parsed.styles)) {
            editor.loadProjectData(parsed);
          } else {
            editor.setComponents(initialContent);
          }
        } catch {
          editor.setComponents(initialContent);
        }
      }

      setReady(true);

      return () => {
        editor.destroy();
        editorRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    useEffect(() => {
      if (!ready || !editorRef.current || !onChange) return;
      const editor = editorRef.current;

      const handleUpdate = () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          const result = editor.runCommand('mjml-code-to-html') as {
            html: string;
            errors: Array<{ formattedMessage: string }>;
          };
          const html = result.html ?? '';
          const json = JSON.stringify(editor.getProjectData());
          onChange(html, json);
        }, 500);
      };

      editor.on('component:update', handleUpdate);
      editor.on('component:add', handleUpdate);
      editor.on('component:remove', handleUpdate);

      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        editor.off('component:update', handleUpdate);
        editor.off('component:add', handleUpdate);
        editor.off('component:remove', handleUpdate);
      };
    }, [ready, onChange]);

    const toggleViewport = useCallback(
      (mode: 'desktop' | 'mobile') => {
        setViewport(mode);
        if (!editorRef.current) return;
        if (mode === 'mobile') {
          editorRef.current.setDevice('Mobile portrait');
        } else {
          editorRef.current.setDevice('Desktop');
        }
      },
      [],
    );

    const togglePreview = useCallback(() => {
      if (!editorRef.current) return;
      if (preview) {
        editorRef.current.stopCommand('preview');
      } else {
        editorRef.current.runCommand('preview');
      }
      setPreview(!preview);
    }, [preview]);

    return (
      <div className="flex flex-col h-full min-h-[500px] bg-white border border-card-border rounded-lg overflow-hidden">
        {/* Editor toolbar */}
        <div className="flex items-center justify-between h-10 px-3 border-b border-card-border bg-white shrink-0">
          <div className="flex items-center gap-1">
            <Button
              variant={viewport === 'desktop' ? 'secondary' : 'ghost'}
              size="icon-xs"
              onClick={() => toggleViewport('desktop')}
              title="Desktop view"
            >
              <Monitor className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant={viewport === 'mobile' ? 'secondary' : 'ghost'}
              size="icon-xs"
              onClick={() => toggleViewport('mobile')}
              title="Mobile view"
            >
              <Smartphone className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant={preview ? 'secondary' : 'ghost'}
              size="xs"
              onClick={togglePreview}
            >
              <Eye className="w-3.5 h-3.5" />
              Preview
            </Button>
            {onSave && (
              <Button
                className="bg-tw-blue hover:bg-tw-blue-dark"
                size="xs"
                onClick={onSave}
                disabled={saving}
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
            )}
          </div>
        </div>

        {/* GrapesJS editor */}
        <div className={cn('flex-1 relative')} ref={containerRef} />
      </div>
    );
  },
);
