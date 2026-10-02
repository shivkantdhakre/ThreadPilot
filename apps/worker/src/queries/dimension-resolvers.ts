import { AggregationDimension } from '@threadpilot/database';

export interface DimensionSQLResolver {
  joinClause: string;
  expression: string;
  filterClause: (valPlaceholder: string) => string;
}

export function getDimensionResolver(
  dimension: AggregationDimension,
  tz = 'UTC',
): DimensionSQLResolver {
  const sanitizedTz = tz.replace(/'/g, "''");

  switch (dimension) {
    case AggregationDimension.TOPIC:
      return {
        joinClause:
          'JOIN content_drafts cd ON cd.id = pp.draft_id JOIN content_ideas ci ON ci.id = cd.idea_id',
        expression: 'ci.topic',
        filterClause: (val) => `ci.topic = ${val}`,
      };

    case AggregationDimension.FORMAT:
      return {
        joinClause:
          'JOIN content_drafts cd ON cd.id = pp.draft_id JOIN content_ideas ci ON ci.id = cd.idea_id',
        expression: 'ci.format',
        filterClause: (val) => `ci.format = ${val}`,
      };

    case AggregationDimension.MEDIA_TYPE:
      return {
        joinClause:
          'LEFT JOIN thread_posts tp ON tp.threads_post_id = pp.threads_post_id AND tp.social_account_id = pp.social_account_id',
        expression: `COALESCE(tp."mediaType", 'TEXT')`,
        filterClause: (val) => `COALESCE(tp."mediaType", 'TEXT') = ${val}`,
      };

    case AggregationDimension.POST_LENGTH_BUCKET:
      return {
        joinClause: 'JOIN content_versions cv ON cv.id = pp.published_version_id',
        expression:
          "CASE WHEN length(cv.body) < 100 THEN 'SHORT' WHEN length(cv.body) <= 280 THEN 'MEDIUM' ELSE 'LONG' END",
        filterClause: (val) =>
          `(CASE WHEN length(cv.body) < 100 THEN 'SHORT' WHEN length(cv.body) <= 280 THEN 'MEDIUM' ELSE 'LONG' END) = ${val}`,
      };

    case AggregationDimension.PUBLISH_HOUR_UTC:
      return {
        joinClause: '',
        expression: 'EXTRACT(HOUR FROM pp.published_at)::text',
        filterClause: (val) => `EXTRACT(HOUR FROM pp.published_at)::text = ${val}`,
      };

    case AggregationDimension.PUBLISH_DAY_OF_WEEK:
      return {
        joinClause: '',
        expression: `EXTRACT(DOW FROM (pp.published_at AT TIME ZONE '${sanitizedTz}'))::text`,
        filterClause: (val) =>
          `EXTRACT(DOW FROM (pp.published_at AT TIME ZONE '${sanitizedTz}'))::text = ${val}`,
      };
  }
}
