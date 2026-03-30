import test from "node:test";
import assert from "node:assert/strict";

import { createExternalSearchService } from "../src/external-search-service.js";

test("external search reranks typo queries to the closest catalog match", async () => {
  const service = createExternalSearchService({
    endpoint: "https://music.example/search",
    musicBrainzEndpoint: "https://musicbrainz.example/ws/2/recording",
    musicBrainzMinIntervalMs: 0,
    fetchImpl: async () => new Response(JSON.stringify({
      results: [
        {
          artistName: "Travis Scott",
          trackId: 1,
          trackName: "YOSEMITE",
          trackTimeMillis: 211000,
          trackViewUrl: "https://music.example/yosemite",
        },
        {
          artistName: "SZA",
          trackId: 2,
          trackName: "Open Arms (feat. Travis Scott)",
          trackTimeMillis: 240000,
          trackViewUrl: "https://music.example/open-arms",
        },
        {
          artistName: "Travis Scott",
          trackId: 3,
          trackName: "FE!N (feat. Playboi Carti)",
          trackTimeMillis: 191000,
          trackViewUrl: "https://music.example/fein",
        },
      ],
    }), {
      headers: {
        "Content-Type": "application/json",
      },
      status: 200,
    }),
  });

  const results = await service.searchTracks("travis scot f!ne", 3);

  assert.equal(results[0].artist, "Travis Scott");
  assert.equal(results[0].title, "FE!N (feat. Playboi Carti)");
  assert.equal(results[0].externalId, "itunes:3");
});

test("external search tries normalized query variants and dedupes repeated hits", async () => {
  const requestedTerms = [];
  const service = createExternalSearchService({
    endpoint: "https://music.example/search",
    musicBrainzEndpoint: "https://musicbrainz.example/ws/2/recording",
    musicBrainzMinIntervalMs: 0,
    fetchImpl: async (url) => {
      const term = new URL(url).searchParams.get("term");
      requestedTerms.push(term);

      if (term === "travis scot f!ne") {
        return new Response(JSON.stringify({ results: [] }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }

      return new Response(JSON.stringify({
        results: [
          {
            artistName: "Travis Scott",
            trackId: 3,
            trackName: "FE!N (feat. Playboi Carti)",
            trackTimeMillis: 191000,
            trackViewUrl: "https://music.example/fein",
          },
        ],
      }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    },
  });

  const results = await service.searchTracks("travis scot f!ne", 5);

  assert.deepEqual(requestedTerms, [
    "travis scot f!ne",
    "travis scot fine",
  ]);
  assert.equal(results.length, 1);
  assert.equal(results[0].title, "FE!N (feat. Playboi Carti)");
});

test("external search falls back to MusicBrainz when Apple catalog has no results", async () => {
  const service = createExternalSearchService({
    endpoint: "https://music.example/search",
    musicBrainzEndpoint: "https://musicbrainz.example/ws/2/recording",
    musicBrainzMinIntervalMs: 0,
    fetchImpl: async (url, options = {}) => {
      const parsedUrl = new URL(url);

      if (parsedUrl.host === "music.example") {
        return new Response(JSON.stringify({ results: [] }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }

      assert.equal(options.headers["User-Agent"], "DemoHubBot/1.0 ( https://github.com/cl0vo/demkez )");

      return new Response(JSON.stringify({
        recordings: [
          {
            "artist-credit": [
              { name: "Aphex Twin" },
            ],
            id: "mbid-1",
            length: 350000,
            score: "100",
            title: "Xtal",
          },
        ],
      }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    },
  });

  const results = await service.searchTracks("aphex twin xtal", 5);

  assert.equal(results.length, 1);
  assert.equal(results[0].artist, "Aphex Twin");
  assert.equal(results[0].title, "Xtal");
  assert.equal(results[0].source, "MusicBrainz");
  assert.equal(results[0].externalId, "musicbrainz:mbid-1");
  assert.equal(results[0].externalUrl, "https://musicbrainz.org/recording/mbid-1");
});

test("external search merges Apple Music and MusicBrainz duplicates into one result card", async () => {
  const service = createExternalSearchService({
    endpoint: "https://music.example/search",
    musicBrainzEndpoint: "https://musicbrainz.example/ws/2/recording",
    musicBrainzMinIntervalMs: 0,
    fetchImpl: async (url) => {
      const parsedUrl = new URL(url);

      if (parsedUrl.host === "music.example") {
        return new Response(JSON.stringify({
          results: [
            {
              artistName: "Aphex Twin",
              artworkUrl100: "https://img.example/xtal.jpg",
              previewUrl: "https://audio.example/xtal.m4a",
              trackId: 99,
              trackName: "Xtal",
              trackTimeMillis: 350000,
              trackViewUrl: "https://music.example/xtal",
            },
          ],
        }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }

      return new Response(JSON.stringify({
        recordings: [
          {
            "artist-credit": [
              { name: "Aphex Twin" },
            ],
            id: "mbid-99",
            length: 350000,
            score: "100",
            title: "Xtal",
          },
        ],
      }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    },
  });

  const results = await service.searchTracks("aphex twin xtal demo rip", 5);

  assert.equal(results.length, 1);
  assert.equal(results[0].source, "Apple Music + MusicBrainz");
  assert.equal(results[0].externalId, "itunes:99");
  assert.equal(results[0].artworkUrl, "https://img.example/xtal.jpg");
});

test("external search fails fast with a descriptive timeout error", async () => {
  const service = createExternalSearchService({
    endpoint: "https://music.example/search",
    musicBrainzEndpoint: "https://musicbrainz.example/ws/2/recording",
    musicBrainzMinIntervalMs: 0,
    requestTimeoutMs: 50,
    fetchImpl: async () => {
      const error = new Error("The operation timed out");
      error.name = "TimeoutError";
      throw error;
    },
  });

  await assert.rejects(
    () => service.searchTracks("timeout demo", 5),
    /External search timed out after 50ms/,
  );
});
