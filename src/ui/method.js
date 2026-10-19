// In-app summary of metric definitions and method. Full version: docs/METHODOLOGY.md.
import { LOW_N } from '../lib/metrics.js';

const REPO = 'https://github.com/Dash-boop0/aeo-geo-visibility-lab/blob/main';

export function render() {
  return `<h1 class="page-title">Method &amp; metric definitions</h1>
  <section class="card prose">
    <h2>What this tool measures</h2>
    <p>For a fixed set of buyer questions, you ask each AI assistant the same prompt, log what it said and which sources it cited,
    and the lab computes how visible your <em>target</em> brand is next to tracked <em>competitors</em>. Every number comes from your
    logged observations; nothing is fetched, scraped or estimated.</p>
    <h2>Definitions (each rate shows numerator/denominator)</h2>
    <dl class="defs">
      <dt>Observation</dt><dd>One logged answer: question × platform × date × run, with the exact prompt and settings.</dd>
      <dt>Observations in scope (n)</dt><dd>Observations passing the active filters. This is the denominator of most rates.</dd>
      <dt>Brand mention rate</dt><dd>Observations whose answer mentions the brand ÷ observations in scope.</dd>
      <dt>Target brand mention rate</dt><dd>Observations mentioning at least one target brand ÷ observations in scope.</dd>
      <dt>Target-domain citation rate</dt><dd>Observations citing ≥1 URL or domain on a target-brand domain (subdomains count) ÷ observations in scope.</dd>
      <dt>Any-citation rate</dt><dd>Observations citing at least one source ÷ observations in scope.</dd>
      <dt>Mention share (competitor mention share)</dt><dd>Mentions of the brand ÷ all tracked-brand mentions in scope. A brand counts at most once per observation.</dd>
      <dt>Citation-source frequency</dt><dd>For each domain: observations citing it (once per observation) ÷ observations in scope; the number of cited URLs is shown alongside.</dd>
      <dt>Run-to-run agreement</dt><dd>Among question × platform × date groups with ≥2 runs: groups where every run agrees on whether a target brand was mentioned ÷ such groups.</dd>
    </dl>
    <h2>Rules that keep the numbers honest</h2>
    <ul>
      <li>A zero denominator is shown as <strong>n/a</strong>, never 0%.</li>
      <li>Rates with a denominator under ${LOW_N} are flagged <strong>⚠ low n</strong>: treat them as directional.</li>
      <li>Comparisons across dates or platforms are only made where both sides have data. By default they use <strong>matched questions</strong> (asked on both sides).</li>
      <li>Missing platform × date combinations are listed explicitly and never imputed.</li>
      <li>Brand mentions and citations are logged by a person. “Suggest from summary” only pre-ticks names it finds; you confirm them.</li>
    </ul>
    <h2>Limitations</h2>
    <ul>
      <li>AI answers vary run to run and by account, location, model version and time. A rate describes your sample, not the platform in general.</li>
      <li>Manual logging can introduce bias (what counts as a “mention”, summary wording, missed citations). Write down your coding rules.</li>
      <li>Results only describe your fixed question set. They are not search rankings or market share.</li>
    </ul>
    <p>Full experiment design, repeatability checklist and worked examples:
      <a href="${REPO}/docs/METHODOLOGY.md" target="_blank" rel="noopener">docs/METHODOLOGY.md</a> ·
      <a href="${REPO}/docs/ARCHITECTURE.md" target="_blank" rel="noopener">docs/ARCHITECTURE.md</a></p>
  </section>`;
}
