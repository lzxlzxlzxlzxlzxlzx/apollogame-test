"""The art/pipeline picker must enumerate every valid built-in game slug."""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from main_entry import games_list
from main_entry.paths import GAME_RE


class GamesListTest(unittest.TestCase):
    def test_builtin_slug_whitelist(self) -> None:
        for slug in ('game-a', 'game101', 'game-potion-brewing', 'game-clue-investigation'):
            with self.subTest(slug=slug):
                self.assertIsNotNone(GAME_RE.fullmatch(slug))
        for slug in ('game--bad', 'game-bad-', 'game-BAD', 'game-../bad', 'other-game'):
            with self.subTest(slug=slug):
                self.assertIsNone(GAME_RE.fullmatch(slug))

    def test_games_endpoint_data_includes_multisegment_slug(self) -> None:
        # Windows sandbox temp may be outside the writable workspace; keep this fixture local.
        with tempfile.TemporaryDirectory(prefix='zerocraft-games-list-', dir=Path(__file__).resolve().parents[1]) as scratch:
            root = Path(scratch)
            for slug in ('game-a', 'game101', 'game-potion-brewing', 'game--bad'):
                (root / 'games' / slug).mkdir(parents=True)
            with patch.object(games_list, 'ROOT', root), patch.object(games_list, '_BUILTIN_META_CACHE', {}):
                games = games_list.handle_games_list()['games']
            self.assertEqual([game['id'] for game in games], ['game-a', 'game-potion-brewing', 'game101'])
            potion = next(game for game in games if game['id'] == 'game-potion-brewing')
            self.assertFalse(potion['hasLocalArt'])
            self.assertFalse(potion['hasManifest'])


if __name__ == '__main__':
    unittest.main()
