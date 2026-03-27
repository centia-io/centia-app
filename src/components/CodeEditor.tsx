import { useRef, useEffect } from 'react';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState, type Extension } from '@codemirror/state';
import { sql as sqlLang } from '@codemirror/lang-sql';
import { json as jsonLang } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import { basicSetup } from 'codemirror';

interface Props {
  value: string;
  onChange?: (v: string) => void;
  language?: 'sql' | 'json' | 'graphql';
  height?: string;
  readOnly?: boolean;
  onRun?: () => void;
  extensions?: Extension[];
}

export default function CodeEditor({ value, onChange, language = 'sql', height = '200px', readOnly = false, onRun, extensions: extraExtensions = [] }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const langExt = extraExtensions.length > 0 ? [] : language === 'json' ? [jsonLang()] : [sqlLang()];

    const runKeymap = onRun
      ? keymap.of([{ key: 'Ctrl-Enter', run: () => { onRun(); return true; } }])
      : [];

    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        ...langExt,
        ...extraExtensions,
        oneDark,
        EditorView.theme({
          '&': { height },
          '.cm-scroller': { overflow: 'auto' },
          '.cm-tooltip-autocomplete ul li': { color: '#888' },
          '.cm-tooltip-autocomplete ul li[aria-selected]': { color: '#fff' },
        }),
        ...(readOnly ? [EditorState.readOnly.of(true)] : []),
        ...(onChange
          ? [EditorView.updateListener.of((update) => {
              if (update.docChanged) onChange(update.state.doc.toString());
            })]
          : []),
        runKeymap,
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, readOnly, extraExtensions]);

  useEffect(() => {
    const view = viewRef.current;
    if (view && view.state.doc.toString() !== value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }
  }, [value]);

  return <div ref={containerRef} style={{ border: '1px solid #d9d9d9', borderRadius: 6, overflow: 'hidden' }} />;
}
