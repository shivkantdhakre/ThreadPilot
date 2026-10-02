import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AggregationDimension } from '@threadpilot/database';
import { getDimensionResolver } from '../dist/queries/dimension-resolvers.js';

describe('DimensionResolvers Unit & Invariant Tests', () => {
  it('resolves all 6 AggregationDimension enums without throwing', () => {
    const dimensions: AggregationDimension[] = [
      AggregationDimension.TOPIC,
      AggregationDimension.FORMAT,
      AggregationDimension.MEDIA_TYPE,
      AggregationDimension.POST_LENGTH_BUCKET,
      AggregationDimension.PUBLISH_HOUR_UTC,
      AggregationDimension.PUBLISH_DAY_OF_WEEK,
    ];

    for (const dim of dimensions) {
      const resolver = getDimensionResolver(dim, 'UTC');
      assert.ok(resolver, `Resolver must be defined for dimension ${dim}`);
      assert.ok(typeof resolver.expression === 'string' && resolver.expression.length > 0);
      assert.ok(typeof resolver.filterClause === 'function');
      const filter = resolver.filterClause('$1');
      assert.ok(filter.includes('$1'));
    }
  });

  describe('Historical Post Graceful Fallbacks (LEFT JOIN & COALESCE)', () => {
    it('TOPIC resolver uses LEFT JOIN and defaults to "General Discussion"', () => {
      const resolver = getDimensionResolver(AggregationDimension.TOPIC);
      assert.ok(resolver.joinClause.includes('LEFT JOIN content_drafts'));
      assert.ok(resolver.joinClause.includes('LEFT JOIN content_ideas'));
      assert.ok(resolver.expression.includes(`COALESCE(ci.topic, 'General Discussion')`));
      assert.equal(
        resolver.filterClause(`'General Discussion'`),
        `COALESCE(ci.topic, 'General Discussion') = 'General Discussion'`,
      );
    });

    it('FORMAT resolver uses LEFT JOIN and defaults to "SINGLE_POST"', () => {
      const resolver = getDimensionResolver(AggregationDimension.FORMAT);
      assert.ok(resolver.joinClause.includes('LEFT JOIN content_drafts'));
      assert.ok(resolver.joinClause.includes('LEFT JOIN content_ideas'));
      assert.ok(resolver.expression.includes(`COALESCE(ci.format, 'SINGLE_POST')`));
      assert.equal(
        resolver.filterClause(`'SINGLE_POST'`),
        `COALESCE(ci.format, 'SINGLE_POST') = 'SINGLE_POST'`,
      );
    });

    it('MEDIA_TYPE resolver joins thread_posts and defaults to "TEXT"', () => {
      const resolver = getDimensionResolver(AggregationDimension.MEDIA_TYPE);
      assert.ok(resolver.joinClause.includes('LEFT JOIN thread_posts'));
      assert.ok(resolver.expression.includes(`COALESCE(tp."mediaType", 'TEXT')`));
    });

    it('POST_LENGTH_BUCKET resolver computes buckets from either content_version or thread_post text', () => {
      const resolver = getDimensionResolver(AggregationDimension.POST_LENGTH_BUCKET);
      assert.ok(resolver.joinClause.includes('LEFT JOIN content_versions'));
      assert.ok(resolver.joinClause.includes('LEFT JOIN thread_posts'));
      assert.ok(resolver.expression.includes('SHORT'));
      assert.ok(resolver.expression.includes('MEDIUM'));
      assert.ok(resolver.expression.includes('LONG'));
      assert.ok(resolver.expression.includes('COALESCE(cv.body, tp.text, '));
    });
  });

  describe('Timezone Handling & SQL Injection Sanitization', () => {
    it('PUBLISH_DAY_OF_WEEK applies timezone parameter correctly', () => {
      const resolverUtc = getDimensionResolver(AggregationDimension.PUBLISH_DAY_OF_WEEK, 'UTC');
      assert.ok(resolverUtc.expression.includes(`AT TIME ZONE 'UTC'`));

      const resolverNy = getDimensionResolver(AggregationDimension.PUBLISH_DAY_OF_WEEK, 'America/New_York');
      assert.ok(resolverNy.expression.includes(`AT TIME ZONE 'America/New_York'`));
    });

    it('sanitizes single quotes in timezone input to prevent SQL injection', () => {
      const maliciousTz = "America/New_York'; DROP TABLE users; --";
      const resolver = getDimensionResolver(AggregationDimension.PUBLISH_DAY_OF_WEEK, maliciousTz);
      // Malicious single quotes must be escaped to '' so it remains a string literal
      assert.ok(resolver.expression.includes("America/New_York''"));
      assert.ok(resolver.expression.includes("''"));
    });
  });
});
