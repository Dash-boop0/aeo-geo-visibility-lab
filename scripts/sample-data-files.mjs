// Builds the contents of the generated sample-data files (shared by the generator and tests).
import { buildSampleProject } from '../src/lib/sample.js';
import { observationsToCSV, questionsToCSV } from '../src/lib/exporters.js';
import { toCSV } from '../src/lib/csv.js';
import { QUESTION_COLUMNS, OBSERVATION_COLUMNS } from '../src/lib/importers.js';
import { SCHEMA, VERSION } from '../src/lib/model.js';

export function sampleDataFiles() {
  const project = buildSampleProject();
  return {
    'questions-template.csv': toCSV([
      QUESTION_COLUMNS,
      ['', 'What are the best tools for <your category>?', 'discovery', 'Example row - replace with your own'],
      ['', 'How much does <your brand> cost?', 'purchase', 'question_id is optional; ids are generated when blank'],
    ]),
    'observations-template.csv': toCSV([
      OBSERVATION_COLUMNS,
      ['', '2026-01-15', 'Assistant A', '1', 'q01', 'What are the best tools for <your category>?', 'discovery',
        'What are the best tools for <your category>?', 'default model; new chat; signed out; en-GB',
        'Example only: names Brand One and Brand Two; links two sources', 'Brand One; Brand Two',
        'https://brandone.example.com/features; https://reviews.example.org/best-tools', '', 'Example row - replace with a real observation you logged'],
    ]),
    'sample-questions-synthetic.csv': questionsToCSV(project),
    'sample-observations-synthetic.csv': observationsToCSV(project),
    'sample-project-backup-synthetic.json': `${JSON.stringify({ schema: SCHEMA, version: VERSION, activeProjectId: project.id, projects: [project] }, null, 2)}\n`,
  };
}
