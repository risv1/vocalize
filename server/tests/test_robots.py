import pytest

from vocalize_server.crawl.robots import RobotsCache

ROBOTS_TXT = """
User-agent: *
Disallow: /private/
Allow: /
"""


@pytest.fixture
def robots_cache(monkeypatch):
    cache = RobotsCache(user_agent="VocalizeBot/0.1")

    async def _get_parser(url: str):
        from urllib.robotparser import RobotFileParser

        parser = RobotFileParser()
        parser.parse(ROBOTS_TXT.splitlines())
        return parser

    monkeypatch.setattr(cache, "_get_parser", _get_parser)
    return cache


async def test_allows_public_path(robots_cache):
    assert await robots_cache.can_fetch("https://example.com/article") is True


async def test_disallows_private_path(robots_cache):
    assert await robots_cache.can_fetch("https://example.com/private/secret") is False
