import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PASS_PLAN,
  DEFAULT_PLANNER_DEFAULTS,
  normalizePassPlan,
  normalizePlannerDefaults,
  normalizeLecturePasses,
  calculateNextDue,
  recalcLectureSchedule,
  groupLectureQueues,
  markPassCompleted,
  shiftLecturePasses
} from '../js/lectures/scheduler.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

test('default scheduler generates anchored passes', () => {
  const planner = normalizePlannerDefaults(DEFAULT_PLANNER_DEFAULTS);
  const plan = normalizePassPlan(DEFAULT_PASS_PLAN);
  const startAt = Date.UTC(2024, 0, 1, 8, 0, 0);
  const passes = normalizeLecturePasses({ plan, plannerDefaults: planner, startAt, now: startAt });
  assert.equal(passes.length, plan.schedule.length, 'pass count matches plan');
  assert.equal(passes[0].due, startAt, 'first pass anchored to start timestamp');
  assert.equal(passes[1].due, startAt + DAY, 'second pass scheduled next day');
  assert.equal(passes[2].due, startAt + DAY * 3, 'third pass scheduled three days later');
  const nextDue = calculateNextDue(passes);
  assert.equal(nextDue, passes[0].due, 'next due resolves earliest pending pass');
});

test('queues group lectures by next due date and shifting respects pending passes', () => {
  const planner = normalizePlannerDefaults(DEFAULT_PLANNER_DEFAULTS);
  const startAt = Date.UTC(2024, 0, 1, 8, 0, 0);
  const now = Date.UTC(2024, 0, 2, 9, 0, 0);
  const plan = DEFAULT_PASS_PLAN;

  const baseLecture = recalcLectureSchedule({ id: 'base', passPlan: plan }, { plannerDefaults: planner, startAt });

  const futureOffset = now + 26 * HOUR;
  const overdueLecture = {
    ...baseLecture,
    id: 'overdue',
    passes: baseLecture.passes.map((pass, index) => {
      if (index === 0) return { ...pass, due: now - HOUR, completedAt: null };
      if (index === 1) return { ...pass, due: futureOffset };
      return { ...pass, due: futureOffset + DAY };
    })
  };

  const todayLecture = {
    ...baseLecture,
    id: 'today',
    passes: baseLecture.passes.map((pass, index) => {
      if (index === 0) return { ...pass, due: now + 2 * HOUR, completedAt: null };
      if (index === 1) return { ...pass, due: futureOffset };
      return { ...pass, due: futureOffset + DAY };
    })
  };

  const completedFirst = markPassCompleted(baseLecture, 0, startAt + HOUR);
  const tomorrowLecture = {
    ...completedFirst,
    id: 'tomorrow',
    passes: completedFirst.passes.map((pass, index) =>
      index === 1 ? { ...pass, due: now + DAY, completedAt: null } : { ...pass }
    )
  };

  const upcomingLecture = {
    ...baseLecture,
    id: 'upcoming',
    passes: baseLecture.passes.map((pass, index) => {
      if (index === 0) return { ...pass, due: now + DAY * 3 };
      if (index === 1) return { ...pass, due: now + DAY * 4 };
      return { ...pass, due: now + DAY * 5 };
    })
  };

  const queues = groupLectureQueues(
    [overdueLecture, todayLecture, tomorrowLecture, upcomingLecture],
    { now }
  );

  assert.equal(queues.overdue.length, 1);
  assert.equal(queues.overdue[0].lecture.id, 'overdue');
  assert.equal(queues.today.length, 1);
  assert.equal(queues.today[0].lecture.id, 'today');
  assert.equal(queues.tomorrow.length, 1);
  assert.equal(queues.tomorrow[0].lecture.id, 'tomorrow');
  assert.equal(queues.upcoming.length, 1);
  assert.equal(queues.upcoming[0].lecture.id, 'upcoming');

  const shifted = shiftLecturePasses(todayLecture, 60);
  assert.ok(shifted, 'shift returns lecture');
  assert.equal(
    shifted.passes[0].due,
    todayLecture.passes[0].due + 60 * 60 * 1000,
    'pending pass shifts by offset'
  );
  assert.equal(
    shifted.passes[1].due,
    todayLecture.passes[1].due + 60 * 60 * 1000,
    'all pending passes shift together'
  );
  assert.equal(shifted.nextDueAt, shifted.passes[0].due, 'next due updates after shift');
});
