"""Focused contract tests for the file-backed roadmap control plane."""
import copy
import tempfile
import unittest
from pathlib import Path

from main_entry import project_roadmap as roadmap


def milestone(status='planned', owner='not-required', review='pass', mid='first', depends=None, evidence=True):
    return {
        'id': mid, 'title': mid.title(), 'track': 'core', 'description': 'A valid item',
        'status': status, 'dependsOn': depends or [], 'acceptance': ['Works'],
        'evidence': [{'kind': 'test', 'ref': 'main_entry/test_project_roadmap.py', 'label': 'contract test'}] if evidence else [],
        'gates': {'selfCheck': 'pass', 'review': review, 'owner': owner},
    }


class ProjectRoadmapValidationTests(unittest.TestCase):
    def setUp(self):
        # The Windows sandbox blocks the interpreter's package-temp directory;
        # keep this short-lived fixture beneath the writable test module instead.
        self.temp = tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        self.root = roadmap.ROOT
        roadmap.ROOT = Path(self.temp.name)

    def tearDown(self):
        roadmap.ROOT = self.root
        self.temp.cleanup()

    def payload(self, *rows):
        data = roadmap.empty('roadmap-test', 'Roadmap test')
        data['milestones'] = list(rows)
        return data

    def persist(self, *rows):
        roadmap.ensure('roadmap-test')
        result = roadmap.save('roadmap-test', self.payload(*rows))
        self.assertTrue(result['success'], result)
        return result

    def test_unhashable_id_is_a_diagnostic_not_an_exception(self):
        data = self.payload(milestone()); data['milestones'][0]['id'] = []
        issues = roadmap.validate(data)
        self.assertTrue(any(issue['path'] == 'milestones[0].id' for issue in issues))

    def test_executable_evidence_scheme_is_rejected(self):
        data = self.payload(milestone()); data['milestones'][0]['evidence'][0]['ref'] = 'javascript:alert(1)'
        self.assertTrue(any('evidence' in issue['path'] for issue in roadmap.validate(data)))

    def test_review_passed_automatic_item_closes_on_save(self):
        result = self.persist(milestone(status='review', owner='not-required'))
        self.assertEqual(result['roadmap']['milestones'][0]['status'], 'done')
        self.assertEqual(result['autoClosed'], ['first'])

    def test_owner_required_item_never_auto_closes(self):
        result = self.persist(milestone(status='review', owner='required'))
        self.assertEqual(result['roadmap']['milestones'][0]['status'], 'review')
        self.assertEqual(result['autoClosed'], [])

    def test_owner_approval_closes_only_when_review_gate_is_ready(self):
        self.persist(milestone(status='review', owner='required'))
        result = roadmap.owner_decide('roadmap-test', 'first', 'approve')
        self.assertTrue(result['success'], result)
        self.assertEqual(result['roadmap']['milestones'][0]['status'], 'done')
        self.assertEqual(result['roadmap']['milestones'][0]['gates']['owner'], 'approved')

    def test_owner_decision_rejects_malformed_request_without_writing(self):
        self.persist(milestone(status='review', owner='required'))
        rejected = roadmap.owner_decide('roadmap-test', [], 'approve')
        self.assertFalse(rejected['success'])
        self.assertEqual(roadmap.load('roadmap-test')['milestones'][0]['status'], 'review')

    def test_owner_return_reopens_work_and_cannot_close(self):
        self.persist(milestone(status='review', owner='required'))
        result = roadmap.owner_decide('roadmap-test', 'first', 'return')
        self.assertTrue(result['success'], result)
        row = result['roadmap']['milestones'][0]
        self.assertEqual((row['status'], row['gates']['owner']), ('active', 'changes-requested'))
        self.assertFalse(roadmap.owner_decide('roadmap-test', 'first', 'approve')['success'])

    def test_owner_approval_rejects_missing_dependency_evidence_or_review(self):
        blocked = milestone(status='review', owner='required', depends=['dependency'])
        dependency = milestone(status='review', owner='required', mid='dependency')
        self.persist(dependency, blocked)
        rejected = roadmap.owner_decide('roadmap-test', 'first', 'approve')
        self.assertFalse(rejected['success'])
        self.assertIn('需要完成依赖', rejected['diagnostics'][0]['message'])

        self.persist(milestone(status='review', owner='required', review='pending', evidence=False))
        rejected = roadmap.owner_decide('roadmap-test', 'first', 'approve')
        self.assertFalse(rejected['success'])

    def test_client_cannot_skip_review_or_reopen_done(self):
        self.persist(milestone(status='active', owner='not-required'))
        direct = self.payload(milestone(status='done', owner='not-required'))
        rejected = roadmap.save('roadmap-test', direct)
        self.assertFalse(rejected['success'])
        self.assertIn('服务端自动收束', rejected['diagnostics'][0]['message'])

        self.persist(milestone(status='review', owner='not-required'))
        reopened = self.payload(milestone(status='active', owner='not-required'))
        self.assertFalse(roadmap.save('roadmap-test', reopened)['success'])

    def test_existing_json_shape_remains_compatible(self):
        result = self.persist(milestone(status='active', owner='not-required', review='pending'))
        self.assertEqual(result['roadmap']['milestones'][0]['status'], 'active')
        self.assertEqual(roadmap.load('roadmap-test')['schemaVersion'], roadmap.SCHEMA)

    def test_next_actionable_keeps_owner_gated_work_and_excludes_review_done(self):
        dependency = milestone(status='done', owner='approved', mid='dependency')
        required = milestone(status='planned', owner='required', mid='required-work', depends=['dependency'])
        returned = milestone(status='active', owner='changes-requested', mid='returned-work', depends=['dependency'])
        review = milestone(status='review', owner='required', mid='review-work', depends=['dependency'])
        done = milestone(status='done', owner='approved', mid='done-work', depends=['dependency'])
        candidates = roadmap.next_actionable(self.payload(dependency, required, returned, review, done))
        self.assertEqual([item['id'] for item in candidates], ['required-work', 'returned-work'])


if __name__ == '__main__':
    unittest.main()
