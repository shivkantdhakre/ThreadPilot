import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('ScheduleCard Timezone Display & Formatting Suite', () => {
  function formatScheduleCardDateTime(scheduledAtIso: string, timezone: string) {
    const scheduledDate = new Date(scheduledAtIso);
    let dateFormatted: string;
    let timeFormatted: string;

    try {
      dateFormatted = scheduledDate.toLocaleDateString('en-US', {
        timeZone: timezone,
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      timeFormatted = scheduledDate.toLocaleTimeString('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      dateFormatted = scheduledDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      timeFormatted = scheduledDate.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    }

    return { dateFormatted, timeFormatted, displayText: `${timeFormatted} (${timezone})` };
  }

  it('renders target 2:00 PM America/New_York accurately without disguising viewer local time', () => {
    // 18:00 UTC = 14:00 (2:00 PM) EDT in America/New_York
    const postScheduledAt = '2026-09-23T18:00:00.000Z';
    const timezone = 'America/New_York';

    const result = formatScheduleCardDateTime(postScheduledAt, timezone);

    assert.strictEqual(result.timeFormatted, '02:00 PM');
    assert.strictEqual(result.dateFormatted, 'Sep 23, 2026');
    assert.strictEqual(result.displayText, '02:00 PM (America/New_York)');
  });

  it('formats accurately for Asia/Kolkata (UTC+5:30)', () => {
    // 18:00 UTC + 5:30 = 23:30 (11:30 PM) on Sep 23
    const postScheduledAt = '2026-09-23T18:00:00.000Z';
    const timezone = 'Asia/Kolkata';

    const result = formatScheduleCardDateTime(postScheduledAt, timezone);
    assert.strictEqual(result.timeFormatted, '11:30 PM');
    assert.strictEqual(result.dateFormatted, 'Sep 23, 2026');
  });

  it('formats accurately for Europe/London (BST, UTC+1)', () => {
    // 18:00 UTC + 1:00 = 19:00 (07:00 PM) on Sep 23
    const postScheduledAt = '2026-09-23T18:00:00.000Z';
    const timezone = 'Europe/London';

    const result = formatScheduleCardDateTime(postScheduledAt, timezone);
    assert.strictEqual(result.timeFormatted, '07:00 PM');
    assert.strictEqual(result.dateFormatted, 'Sep 23, 2026');
  });

  it('formats accurately for Asia/Tokyo (JST, UTC+9, across date boundary)', () => {
    // 18:00 UTC + 9:00 = 03:00 (03:00 AM) on Sep 24
    const postScheduledAt = '2026-09-23T18:00:00.000Z';
    const timezone = 'Asia/Tokyo';

    const result = formatScheduleCardDateTime(postScheduledAt, timezone);
    assert.strictEqual(result.timeFormatted, '03:00 AM');
    assert.strictEqual(result.dateFormatted, 'Sep 24, 2026');
  });

  it('formats accurately for UTC', () => {
    const postScheduledAt = '2026-09-23T18:00:00.000Z';
    const timezone = 'UTC';

    const result = formatScheduleCardDateTime(postScheduledAt, timezone);
    assert.strictEqual(result.timeFormatted, '06:00 PM');
    assert.strictEqual(result.dateFormatted, 'Sep 23, 2026');
  });

  it('handles midnight correctly (12:00 AM)', () => {
    // 04:00 UTC = 00:00 EDT in America/New_York
    const postScheduledAt = '2026-09-23T04:00:00.000Z';
    const timezone = 'America/New_York';

    const result = formatScheduleCardDateTime(postScheduledAt, timezone);
    assert.strictEqual(result.timeFormatted, '12:00 AM');
    assert.strictEqual(result.dateFormatted, 'Sep 23, 2026');
  });

  it('handles month boundary transitions across timezones', () => {
    // 2026-08-31T23:00:00.000Z
    // In America/New_York (-4h) -> Aug 31 at 07:00 PM
    // In Asia/Kolkata (+5h30m) -> Sep 1 at 04:30 AM
    const postScheduledAt = '2026-08-31T23:00:00.000Z';

    const nyResult = formatScheduleCardDateTime(postScheduledAt, 'America/New_York');
    assert.strictEqual(nyResult.dateFormatted, 'Aug 31, 2026');
    assert.strictEqual(nyResult.timeFormatted, '07:00 PM');

    const kolkataResult = formatScheduleCardDateTime(postScheduledAt, 'Asia/Kolkata');
    assert.strictEqual(kolkataResult.dateFormatted, 'Sep 1, 2026');
    assert.strictEqual(kolkataResult.timeFormatted, '04:30 AM');
  });

  it('handles DST boundary transitions accurately (EST to EDT)', () => {
    // America/New_York winter (EST, UTC-5): 18:00 UTC = 13:00 (01:00 PM)
    const winterUtc = '2026-01-15T18:00:00.000Z';
    const winterResult = formatScheduleCardDateTime(winterUtc, 'America/New_York');
    assert.strictEqual(winterResult.timeFormatted, '01:00 PM');
    assert.strictEqual(winterResult.dateFormatted, 'Jan 15, 2026');

    // America/New_York summer (EDT, UTC-4): 18:00 UTC = 14:00 (02:00 PM)
    const summerUtc = '2026-07-15T18:00:00.000Z';
    const summerResult = formatScheduleCardDateTime(summerUtc, 'America/New_York');
    assert.strictEqual(summerResult.timeFormatted, '02:00 PM');
    assert.strictEqual(summerResult.dateFormatted, 'Jul 15, 2026');

    // DST spring transition boundary (March 8, 2026)
    // 06:59:00 UTC is 01:59 AM EST (UTC-5)
    const preTransition = '2026-03-08T06:59:00.000Z';
    const preResult = formatScheduleCardDateTime(preTransition, 'America/New_York');
    assert.strictEqual(preResult.timeFormatted, '01:59 AM');

    // 07:01:00 UTC is 03:01 AM EDT (UTC-4) - clock skipped 2:00-2:59
    const postTransition = '2026-03-08T07:01:00.000Z';
    const postResult = formatScheduleCardDateTime(postTransition, 'America/New_York');
    assert.strictEqual(postResult.timeFormatted, '03:01 AM');
  });

  it('gracefully falls back when timezone string is invalid', () => {
    const postScheduledAt = '2026-09-23T18:00:00.000Z';
    const invalidTimezone = 'Invalid/Non_Existent_TZ';

    const result = formatScheduleCardDateTime(postScheduledAt, invalidTimezone);
    assert.ok(result.dateFormatted.length > 0);
    assert.ok(result.timeFormatted.length > 0);
  });
});
