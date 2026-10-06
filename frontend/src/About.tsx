import { useRef } from 'react';

import { tr } from './i18n';

const REPO_URL = 'https://github.com/jonorl/pollution';
// Product names, so the same in every language.
const STACK = [
  'Rust · ESP-IDF',
  'TypeScript',
  'Fastify',
  'Prisma',
  'PostgreSQL',
  'Docker',
  'Caddy',
  'GitHub Actions',
  'React',
  'Vite',
  'three.js',
  'Cloudflare',
];

/** The button that opens the project notes, and the dialog it opens. */
export function About() {
  const dialog = useRef<HTMLDialogElement>(null);
  const text = tr().about;

  return (
    <>
      <button type="button" className="about-open" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>
        {text.open}
      </button>
      <dialog
        ref={dialog}
        className="about"
        aria-labelledby="about-heading"
        // The padding sits on the inner box, so a click that lands on the dialog itself is on the backdrop.
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <div className="about-body">
          <div className="about-top">
            <h2 id="about-heading">{text.title}</h2>
            <button type="button" className="about-close" onClick={() => dialog.current?.close()}>
              {text.close}
            </button>
          </div>
          <p className="about-intro">{text.intro}</p>
          <dl className="about-facts">
            {text.sections.map((section) => (
              <div key={section.heading}>
                <dt>{section.heading}</dt>
                <dd>{section.body}</dd>
              </div>
            ))}
            <div>
              <dt>{text.stack}</dt>
              <dd>
                <ul className="about-stack">
                  {STACK.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </dd>
            </div>
          </dl>
          <a className="about-source" href={REPO_URL} target="_blank" rel="noreferrer">
            {text.source} ↗
          </a>
        </div>
      </dialog>
    </>
  );
}
