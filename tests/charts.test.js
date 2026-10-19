import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barChart, stackedBarChart, lineChart, legendHTML, esc, inkOn, colorAt, OTHER_COLOR } from '../src/lib/charts.js';

test('esc escapes HTML special characters', () => {
  assert.equal(esc('<a href="x">\'&'), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
});

test('bar chart labels values with n, shows n/a for empty denominators and escapes labels', () => {
  const svg = barChart({ title: 'T', width: 640, items: [
    { label: '<b>Brand</b>', value: 0.5, num: 5, den: 10, lowN: false, color: '#2F5BEA' },
    { label: 'Empty', value: null, num: 0, den: 0, lowN: true },
    { label: 'Small', value: 0.25, num: 1, den: 4, lowN: true },
  ] });
  assert.match(svg, /^<svg[^>]+role="img"/);
  assert.match(svg, /<title>T<\/title>/);
  assert.match(svg, /50\.0% \(5\/10\)/);
  assert.match(svg, /n\/a \(n=0\)/);
  assert.match(svg, /25\.0% \(1\/4\) ⚠/);
  assert.ok(!svg.includes('<b>'));
  assert.equal((svg.match(/<path /g) || []).length, 2, 'no bar drawn for n/a');
});

test('narrow bar chart stacks labels above bars', () => {
  const svg = barChart({ title: 'T', width: 320, items: [{ label: 'A', value: 1, num: 1, den: 1 }] });
  assert.match(svg, /width="320"/);
  assert.match(svg, /<text class="label" x="0"/);
});

test('stacked bar shows empty rows explicitly', () => {
  const svg = stackedBarChart({ title: 'S', rows: [
    { label: 'P1', total: 4, segments: [{ name: 'A', value: 0.75, count: 3, color: '#2F5BEA' }, { name: 'B', value: 0.25, count: 1, color: '#E07A1F' }] },
    { label: 'P2', total: 0, segments: [] },
  ] });
  assert.match(svg, /no tracked-brand mentions/);
  assert.match(svg, /P1 · A: 75\.0% of tracked-brand mentions \(3\/4\)/);
});

test('line chart breaks at missing points and never draws them as zero', () => {
  const svg = lineChart({ title: 'L', categories: ['d1', 'd2'], series: [
    { name: 'A', color: '#2F5BEA', points: [{ x: 'd1', value: 0.2, num: 1, den: 5 }, { x: 'd2', value: 0.4, num: 2, den: 5 }] },
    { name: 'C', color: '#E07A1F', points: [{ x: 'd1', value: null }, { x: 'd2', value: 0.5, num: 5, den: 10 }] },
  ] });
  assert.equal((svg.match(/<path /g) || []).length, 1, 'only series A has a line');
  assert.equal((svg.match(/class="dot"/g) || []).length, 3);
  assert.ok(!svg.includes('C · d1'));
});

test('palette helpers', () => {
  assert.equal(colorAt(0), '#2F5BEA');
  assert.equal(colorAt(99), OTHER_COLOR);
  assert.equal(inkOn('#2F5BEA'), '#FFFFFF');
  assert.equal(inkOn('#F7F7F5'), '#1C1C1A');
  assert.match(legendHTML([{ name: 'X & Y', color: '#000000' }]), /X &amp; Y/);
});
