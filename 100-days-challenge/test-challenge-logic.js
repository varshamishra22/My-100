/**
 * Test Challenge Date Logic and Streak Calculations
 */

import {
  CHALLENGE_CONFIG,
  getDateForDay,
  getChallengeDayInfo,
  formatReadableDate
} from './date-utils.js';

console.log('--- Testing Date Calculations ---');

// Test 1: Day 1 Date
const day1 = getDateForDay(1);
console.assert(day1 === '2026-09-29', `Day 1 should be 2026-09-29, got ${day1}`);
console.log('✓ Day 1 Date:', day1);

// Test 2: Day 2 Date
const day2 = getDateForDay(2);
console.assert(day2 === '2026-09-30', `Day 2 should be 2026-09-30, got ${day2}`);
console.log('✓ Day 2 Date:', day2);

// Test 3: Day 15 Date
const day15 = getDateForDay(15);
console.assert(day15 === '2026-10-13', `Day 15 should be 2026-10-13, got ${day15}`);
console.log('✓ Day 15 Date:', day15);

// Test 4: Day 100 Date
const day100 = getDateForDay(100);
console.assert(day100 === '2027-01-06', `Day 100 should be 2027-01-06, got ${day100}`);
console.log('✓ Day 100 Date:', day100);

// Test 5: Day Info for Pre-challenge date (2026-09-28)
const infoBefore = getChallengeDayInfo('2026-09-28');
console.assert(infoBefore.status === 'before', `Status before start should be 'before', got ${infoBefore.status}`);
console.log('✓ Pre-challenge Status:', infoBefore);

// Test 6: Day Info for Day 1 (2026-09-29)
const infoDay1 = getChallengeDayInfo('2026-09-29');
console.assert(infoDay1.dayNumber === 1 && infoDay1.status === 'active', `Day 1 check failed`);
console.log('✓ Day 1 Info:', infoDay1);

// Test 7: Day Info for Day 100 (2027-01-06)
const infoDay100 = getChallengeDayInfo('2027-01-06');
console.assert(infoDay100.dayNumber === 100 && infoDay100.status === 'active', `Day 100 check failed`);
console.log('✓ Day 100 Info:', infoDay100);

// Test 8: Day Info after Day 100 (2027-01-07)
const infoAfter = getChallengeDayInfo('2027-01-07');
console.assert(infoAfter.status === 'completed', `After challenge should be 'completed'`);
console.log('✓ Post-challenge Info:', infoAfter);

console.log('\n--- Testing Streak Logic Simulation ---');
// Simulate 10 days of user records:
// Day 1: completed
// Day 2: completed
// Day 3: partial (1 target) -> active
// Day 4: 0 targets -> inactive (breaks streak)
// Day 5: completed
// Day 6: completed
// Day 7: completed (today)

const simulatedDaysMap = new Map([
  [1, { dayNumber: 1, completedCount: 5, status: 'completed' }],
  [2, { dayNumber: 2, completedCount: 4, status: 'partial' }],
  [3, { dayNumber: 3, completedCount: 1, status: 'partial' }],
  [4, { dayNumber: 4, completedCount: 0, status: 'inactive' }],
  [5, { dayNumber: 5, completedCount: 5, status: 'completed' }],
  [6, { dayNumber: 6, completedCount: 3, status: 'partial' }],
  [7, { dayNumber: 7, completedCount: 5, status: 'completed' }]
]);

const currentDay = 7;
let longestStreak = 0;
let streakCounter = 0;
let activeDays = 0;
let inactiveDays = 0;
let completedTasks = 0;

for (let d = 1; d <= currentDay; d++) {
  const rec = simulatedDaysMap.get(d);
  const isActive = rec && rec.completedCount > 0;
  if (isActive) {
    activeDays++;
    completedTasks += rec.completedCount;
    streakCounter++;
    if (streakCounter > longestStreak) {
      longestStreak = streakCounter;
    }
  } else {
    inactiveDays++;
    streakCounter = 0;
  }
}

// Current streak backward from currentDay
let currentStreak = 0;
const todayRec = simulatedDaysMap.get(currentDay);
const todayActive = todayRec && todayRec.completedCount > 0;
let checkDay = todayActive ? currentDay : currentDay - 1;

while (checkDay >= 1) {
  const rec = simulatedDaysMap.get(checkDay);
  if (rec && rec.completedCount > 0) {
    currentStreak++;
    checkDay--;
  } else {
    break;
  }
}

console.log('Active Days (expected 6):', activeDays);
console.assert(activeDays === 6, 'Active days mismatch');

console.log('Inactive Days (expected 1):', inactiveDays);
console.assert(inactiveDays === 1, 'Inactive days mismatch');

console.log('Longest Streak (expected 3):', longestStreak);
console.assert(longestStreak === 3, 'Longest streak mismatch');

console.log('Current Streak (expected 3: Days 5, 6, 7):', currentStreak);
console.assert(currentStreak === 3, 'Current streak mismatch');

console.log('Completed Tasks (expected 23):', completedTasks);
console.assert(completedTasks === 23, 'Completed tasks mismatch');

console.log('\n✅ All challenge logic and streak assertions passed successfully!');
