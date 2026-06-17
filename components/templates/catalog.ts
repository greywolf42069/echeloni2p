import type { TemplateDescriptor } from './types.ts';

/* ============================================================
 * FREE — 3 starter templates ship to every Echelon user.
 * ============================================================ */

const blankTemplate: TemplateDescriptor = {
    id: 'tpl-blank',
    name: 'Blank',
    description: 'A minimal HTML + CSS scaffold. Bring your own everything.',
    category: 'Personal',
    tier: 'free',
    accent: 'sky',
    buildFiles: () => ({
        'index.html': {
            content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My eepsite</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <main>
        <h1>Hello, I2P.</h1>
        <p>Edit <code>index.html</code> to make this your own.</p>
    </main>
</body>
</html>`,
        },
        'style.css': {
            content: `body { font-family: system-ui, sans-serif; max-width: 720px; margin: 4rem auto; padding: 0 1.5rem; line-height: 1.6; color: #e5e7eb; background: #0f172a; }
h1 { color: #c4b5fd; }
code { background: #1e293b; padding: .15em .35em; border-radius: 4px; }
`,
        },
    }),
};

const personalBlogTemplate: TemplateDescriptor = {
    id: 'tpl-blog-basic',
    name: 'Personal Blog',
    description: 'A clean, single-author blog with post pagination and an RSS-style feed page.',
    category: 'Personal',
    tier: 'free',
    accent: 'purple',
    buildFiles: () => ({
        'index.html': {
            content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My I2P Blog</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <header>
        <h1>My I2P Blog</h1>
        <p class="tagline">Notes from the invisible internet</p>
        <nav>
            <a href="index.html">Home</a>
            <a href="archive.html">Archive</a>
            <a href="about.html">About</a>
        </nav>
    </header>
    <main>
        <article class="post">
            <h2><a href="post-1.html">My first I2P post</a></h2>
            <time>2026-05-28</time>
            <p>This is the first post on my new private blog. Hosted on i2pd, edited in Echelon, served only to readers who actually want to be here.</p>
            <a class="read-more" href="post-1.html">Read more →</a>
        </article>
    </main>
    <footer>
        <p>Powered by <a href="https://geti2p.net">I2P</a> &amp; Echelon</p>
    </footer>
</body>
</html>`,
        },
        'post-1.html': {
            content: `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>My first I2P post</title><link rel="stylesheet" href="style.css"></head>
<body>
    <header><h1><a href="index.html">My I2P Blog</a></h1></header>
    <main>
        <article class="post">
            <h2>My first I2P post</h2>
            <time>2026-05-28</time>
            <p>Welcome. This is what a real eepsite looks like — yours, not theirs.</p>
            <p>Replace this content with whatever you want to say. Markdown won't render automatically; this template is intentionally simple HTML.</p>
        </article>
        <p><a href="index.html">← Back to home</a></p>
    </main>
</body></html>`,
        },
        'archive.html': {
            content: `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Archive — My I2P Blog</title><link rel="stylesheet" href="style.css"></head>
<body>
    <header><h1><a href="index.html">My I2P Blog</a></h1></header>
    <main>
        <h2>Archive</h2>
        <ul class="archive-list">
            <li><time>2026-05-28</time> · <a href="post-1.html">My first I2P post</a></li>
        </ul>
    </main>
</body></html>`,
        },
        'about.html': {
            content: `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>About — My I2P Blog</title><link rel="stylesheet" href="style.css"></head>
<body>
    <header><h1><a href="index.html">My I2P Blog</a></h1></header>
    <main>
        <h2>About</h2>
        <p>Hi. I'm anonymous. So are you. That's the point.</p>
    </main>
</body></html>`,
        },
        'style.css': {
            content: `* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: ui-serif, Georgia, serif; line-height: 1.7; color: #e5e7eb; background: #0f172a; }
header { padding: 3rem 1.5rem 2rem; text-align: center; border-bottom: 1px solid #1e293b; }
header h1 { font-size: 2.25rem; color: #c4b5fd; }
header h1 a { color: inherit; text-decoration: none; }
.tagline { color: #94a3b8; margin-top: .25rem; font-style: italic; }
nav { margin-top: 1.5rem; }
nav a { color: #c4b5fd; text-decoration: none; margin: 0 .75rem; font-size: .9rem; }
main { max-width: 680px; margin: 3rem auto; padding: 0 1.5rem; }
.post { margin-bottom: 3rem; }
.post h2 { font-size: 1.5rem; margin-bottom: .25rem; }
.post h2 a { color: #f1f5f9; text-decoration: none; }
.post h2 a:hover { color: #c4b5fd; }
.post time { font-size: .85rem; color: #94a3b8; }
.post p { margin-top: .75rem; }
.read-more { display: inline-block; margin-top: .5rem; color: #c4b5fd; text-decoration: none; }
.archive-list { list-style: none; }
.archive-list li { padding: .5rem 0; border-bottom: 1px solid #1e293b; }
.archive-list a { color: #f1f5f9; }
footer { text-align: center; padding: 2rem; font-size: .85rem; color: #94a3b8; border-top: 1px solid #1e293b; margin-top: 4rem; }
footer a { color: #c4b5fd; }
`,
        },
    }),
};

const linktreeTemplate: TemplateDescriptor = {
    id: 'tpl-linktree',
    name: 'Linktree',
    description: 'A single-page card with your eepsite, your contact methods, and your other links.',
    category: 'Personal',
    tier: 'free',
    accent: 'teal',
    buildFiles: () => ({
        'index.html': {
            content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>links</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <main class="card">
        <div class="avatar">🦊</div>
        <h1>your_name</h1>
        <p class="bio">privacy enthusiast · i2p resident</p>
        <a class="link" href="#">Mastodon</a>
        <a class="link" href="#">Matrix</a>
        <a class="link" href="#">PGP key</a>
        <a class="link" href="#">Other eepsite</a>
        <p class="footer">hosted on the invisible internet</p>
    </main>
</body>
</html>`,
        },
        'style.css': {
            content: `* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: ui-sans-serif, system-ui, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #0f172a, #1e3a8a); padding: 2rem; }
.card { width: 100%; max-width: 380px; background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(10px); border: 1px solid rgba(20, 184, 166, 0.3); border-radius: 16px; padding: 2.5rem 1.5rem; text-align: center; }
.avatar { font-size: 4rem; margin-bottom: .5rem; }
.card h1 { color: #5eead4; font-size: 1.5rem; margin-bottom: .25rem; }
.bio { color: #94a3b8; font-size: .9rem; margin-bottom: 1.5rem; }
.link { display: block; margin: .75rem 0; padding: .75rem 1rem; background: rgba(20, 184, 166, 0.1); color: #ccfbf1; text-decoration: none; border-radius: 8px; font-weight: 500; transition: background 0.2s; }
.link:hover { background: rgba(20, 184, 166, 0.25); }
.footer { color: #64748b; font-size: .75rem; margin-top: 1.5rem; }
`,
        },
    }),
};

/* ============================================================
 * PREMIUM — gated behind $19 USDC TemplatePack purchase.
 * ============================================================ */

const portfolioTemplate: TemplateDescriptor = {
    id: 'tpl-portfolio-pro',
    name: 'Portfolio (Pro)',
    description: 'A multi-section developer portfolio with project cards, skills, and a contact form.',
    category: 'Portfolio',
    tier: 'premium',
    accent: 'amber',
    buildFiles: () => ({
        'index.html': {
            content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>your_name — portfolio</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <header class="hero">
        <div class="container">
            <h1>your_name</h1>
            <p class="role">software · privacy · networks</p>
            <div class="cta">
                <a class="btn" href="#projects">Projects</a>
                <a class="btn btn-secondary" href="#contact">Get in touch</a>
            </div>
        </div>
    </header>
    <section id="projects" class="container">
        <h2>Projects</h2>
        <div class="grid">
            <article class="project">
                <h3>Project Alpha</h3>
                <p>A short, punchy summary. What it does, who it's for, why it matters.</p>
                <div class="tags"><span>Rust</span><span>i2p</span></div>
            </article>
            <article class="project">
                <h3>Project Beta</h3>
                <p>Another project. Lean into outcomes more than tooling — readers care about the why.</p>
                <div class="tags"><span>TypeScript</span><span>Solana</span></div>
            </article>
            <article class="project">
                <h3>Project Gamma</h3>
                <p>Be specific. Numbers, screenshots, links to source. Rotate every 6 months.</p>
                <div class="tags"><span>Python</span><span>Crypto</span></div>
            </article>
        </div>
    </section>
    <section id="skills" class="container">
        <h2>Skills</h2>
        <ul class="skills">
            <li>Distributed systems</li>
            <li>Cryptography</li>
            <li>Linux internals</li>
            <li>P2P networking</li>
            <li>Web development</li>
            <li>Solana programs</li>
        </ul>
    </section>
    <section id="contact" class="container">
        <h2>Contact</h2>
        <p>Reach me on <a href="#">Matrix</a>, via <a href="#">PGP</a>, or send a <a href="#">tip</a>.</p>
    </section>
    <footer><p>© 2026 your_name · Hosted on the invisible internet</p></footer>
</body>
</html>`,
        },
        'style.css': {
            content: `* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.7; color: #e5e7eb; background: #0f172a; }
.container { max-width: 960px; margin: 0 auto; padding: 0 1.5rem; }
.hero { padding: 6rem 0 5rem; background: linear-gradient(135deg, #0f172a, #422006); border-bottom: 1px solid #1e293b; }
.hero h1 { font-size: clamp(2.5rem, 5vw, 4rem); color: #fbbf24; }
.role { color: #fcd34d; margin-top: .5rem; font-size: 1.125rem; }
.cta { margin-top: 2rem; display: flex; gap: 1rem; flex-wrap: wrap; }
.btn { padding: .75rem 1.5rem; background: #d97706; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; transition: background 0.2s; }
.btn:hover { background: #b45309; }
.btn-secondary { background: transparent; border: 1px solid #d97706; color: #fbbf24; }
.btn-secondary:hover { background: rgba(217, 119, 6, 0.1); }
section { padding: 4rem 0; border-bottom: 1px solid #1e293b; }
section h2 { font-size: 2rem; margin-bottom: 2rem; color: #f1f5f9; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1.5rem; }
.project { padding: 1.5rem; background: #1e293b; border-radius: 10px; border: 1px solid #334155; }
.project h3 { color: #fbbf24; margin-bottom: .5rem; }
.tags { margin-top: 1rem; display: flex; gap: .5rem; flex-wrap: wrap; }
.tags span { padding: .25rem .65rem; background: rgba(217, 119, 6, 0.15); color: #fbbf24; border-radius: 999px; font-size: .8rem; }
.skills { list-style: none; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: .75rem; }
.skills li { padding: .75rem 1rem; background: #1e293b; border-radius: 6px; border-left: 3px solid #d97706; }
footer { padding: 2rem; text-align: center; color: #64748b; font-size: .85rem; }
a { color: #fbbf24; }
`,
        },
    }),
};

const docsTemplate: TemplateDescriptor = {
    id: 'tpl-docs',
    name: 'Documentation Site',
    description: 'Sidebar navigation, search-friendly content layout, syntax-friendly code blocks.',
    category: 'Documentation',
    tier: 'premium',
    accent: 'rose',
    buildFiles: () => ({
        'index.html': {
            content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Project Docs</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <aside>
        <h1><a href="index.html">Project Docs</a></h1>
        <nav>
            <ul>
                <li><a href="index.html" class="active">Introduction</a></li>
                <li><a href="install.html">Installation</a></li>
                <li><a href="usage.html">Usage</a></li>
                <li><a href="api.html">API reference</a></li>
            </ul>
        </nav>
    </aside>
    <main>
        <article>
            <h2>Introduction</h2>
            <p>This is the documentation for <strong>your project</strong>. Replace this scaffold with what your readers actually need to know.</p>
            <h3>What it is</h3>
            <p>One paragraph framing — what is the thing, who is it for, what problem does it solve.</p>
            <h3>Quick start</h3>
            <pre><code># Replace with your install command
$ install your-thing
# And your hello-world invocation
$ your-thing --version</code></pre>
            <p>See <a href="install.html">Installation</a> for full setup or <a href="usage.html">Usage</a> for examples.</p>
        </article>
    </main>
</body>
</html>`,
        },
        'install.html': {
            content: `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Installation — Project Docs</title><link rel="stylesheet" href="style.css"></head>
<body>
    <aside>
        <h1><a href="index.html">Project Docs</a></h1>
        <nav><ul>
            <li><a href="index.html">Introduction</a></li>
            <li><a href="install.html" class="active">Installation</a></li>
            <li><a href="usage.html">Usage</a></li>
            <li><a href="api.html">API reference</a></li>
        </ul></nav>
    </aside>
    <main><article>
        <h2>Installation</h2>
        <p>Document your install steps here.</p>
    </article></main>
</body></html>`,
        },
        'usage.html': {
            content: `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Usage — Project Docs</title><link rel="stylesheet" href="style.css"></head>
<body>
    <aside>
        <h1><a href="index.html">Project Docs</a></h1>
        <nav><ul>
            <li><a href="index.html">Introduction</a></li>
            <li><a href="install.html">Installation</a></li>
            <li><a href="usage.html" class="active">Usage</a></li>
            <li><a href="api.html">API reference</a></li>
        </ul></nav>
    </aside>
    <main><article>
        <h2>Usage</h2>
        <p>Add concrete examples here.</p>
    </article></main>
</body></html>`,
        },
        'api.html': {
            content: `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>API — Project Docs</title><link rel="stylesheet" href="style.css"></head>
<body>
    <aside>
        <h1><a href="index.html">Project Docs</a></h1>
        <nav><ul>
            <li><a href="index.html">Introduction</a></li>
            <li><a href="install.html">Installation</a></li>
            <li><a href="usage.html">Usage</a></li>
            <li><a href="api.html" class="active">API reference</a></li>
        </ul></nav>
    </aside>
    <main><article>
        <h2>API reference</h2>
        <p>Document every public symbol here.</p>
    </article></main>
</body></html>`,
        },
        'style.css': {
            content: `* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.7; color: #e5e7eb; background: #0f172a; display: flex; min-height: 100vh; }
aside { width: 260px; background: #020617; padding: 2rem 1.5rem; border-right: 1px solid #1e293b; flex-shrink: 0; }
aside h1 { font-size: 1.125rem; color: #fda4af; margin-bottom: 1.5rem; }
aside h1 a { color: inherit; text-decoration: none; }
aside nav ul { list-style: none; }
aside nav a { display: block; padding: .5rem .75rem; color: #94a3b8; text-decoration: none; border-radius: 6px; font-size: .9rem; }
aside nav a:hover { color: #fda4af; background: rgba(244, 63, 94, 0.1); }
aside nav a.active { color: #fda4af; background: rgba(244, 63, 94, 0.15); }
main { flex: 1; padding: 3rem 2rem; max-width: 760px; }
article h2 { font-size: 2rem; margin-bottom: 1rem; color: #f1f5f9; }
article h3 { font-size: 1.25rem; margin: 2rem 0 .75rem; color: #fda4af; }
article p { margin-bottom: 1rem; }
article a { color: #fda4af; }
pre { background: #020617; padding: 1rem; border-radius: 8px; border: 1px solid #1e293b; margin: 1rem 0; overflow-x: auto; }
code { font-family: ui-monospace, monospace; font-size: .9rem; color: #fbbf24; }
@media (max-width: 768px) { body { flex-direction: column; } aside { width: 100%; border-right: none; border-bottom: 1px solid #1e293b; } main { padding: 2rem 1.5rem; } }
`,
        },
    }),
};

const galleryTemplate: TemplateDescriptor = {
    id: 'tpl-gallery',
    name: 'Image Gallery',
    description: 'A masonry-style image gallery for sharing photos privately. Lightbox-friendly markup.',
    category: 'Gallery',
    tier: 'premium',
    accent: 'emerald',
    buildFiles: () => ({
        'index.html': {
            content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gallery</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <header>
        <h1>Gallery</h1>
        <p>Drop images into this directory and add them to <code>index.html</code>.</p>
    </header>
    <main class="gallery">
        <figure><div class="placeholder">img-1.jpg</div><figcaption>Caption one</figcaption></figure>
        <figure><div class="placeholder">img-2.jpg</div><figcaption>Caption two</figcaption></figure>
        <figure><div class="placeholder">img-3.jpg</div><figcaption>Caption three</figcaption></figure>
        <figure><div class="placeholder">img-4.jpg</div><figcaption>Caption four</figcaption></figure>
        <figure><div class="placeholder">img-5.jpg</div><figcaption>Caption five</figcaption></figure>
        <figure><div class="placeholder">img-6.jpg</div><figcaption>Caption six</figcaption></figure>
    </main>
</body>
</html>`,
        },
        'style.css': {
            content: `* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: ui-sans-serif, system-ui, sans-serif; background: #0f172a; color: #e5e7eb; min-height: 100vh; }
header { padding: 3rem 1.5rem 1rem; text-align: center; }
header h1 { font-size: 2rem; color: #6ee7b7; margin-bottom: .5rem; }
header p { color: #94a3b8; font-size: .9rem; }
header code { background: #1e293b; padding: .15em .4em; border-radius: 4px; color: #6ee7b7; }
.gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; padding: 2rem 1.5rem 4rem; max-width: 1280px; margin: 0 auto; }
figure { background: #1e293b; border-radius: 10px; overflow: hidden; border: 1px solid #334155; transition: transform 0.2s; }
figure:hover { transform: translateY(-4px); border-color: #10b981; }
.placeholder { aspect-ratio: 4/3; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #064e3b, #134e4a); color: #6ee7b7; font-family: ui-monospace, monospace; font-size: .85rem; }
figcaption { padding: .75rem 1rem; font-size: .9rem; color: #94a3b8; }
`,
        },
    }),
};

// ── Exports ──────────────────────────────────────────────────────

export const FREE_TEMPLATES: ReadonlyArray<TemplateDescriptor> = [
    blankTemplate,
    personalBlogTemplate,
    linktreeTemplate,
];

export const PREMIUM_TEMPLATES: ReadonlyArray<TemplateDescriptor> = [
    portfolioTemplate,
    docsTemplate,
    galleryTemplate,
];

export const ALL_TEMPLATES: ReadonlyArray<TemplateDescriptor> = [
    ...FREE_TEMPLATES,
    ...PREMIUM_TEMPLATES,
];

/** Lookup by id. Returns undefined for unknown ids. */
export function findTemplate(id: string): TemplateDescriptor | undefined {
    return ALL_TEMPLATES.find(t => t.id === id);
}
