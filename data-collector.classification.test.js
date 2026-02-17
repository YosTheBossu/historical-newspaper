const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyEvent } = require('./data-collector');

test('requires at least one strong Israeli signal', () => {
  const res = classifyEvent({
    text: 'A Jewish community event with Hebrew poetry and Zion references',
    pageTitle: 'Cultural history'
  });

  assert.notEqual(res.category, 'israel');
  assert.equal(res.isIsraeliVerified, false);
});

test('classifies as israel when strong signal appears', () => {
  const res = classifyEvent({
    text: 'The Knesset approved a new budget bill in Jerusalem',
    pageTitle: 'Israeli politics'
  });

  assert.equal(res.category, 'israel');
  assert.equal(res.isIsraeliVerified, true);
  assert.equal(res.israelSignals.strongCount > 0, true);
});

test('blacklists global Jewish context even with Jewish terms', () => {
  const res = classifyEvent({
    text: 'The American Jewish community in New York opened a museum',
    pageTitle: 'Diaspora news'
  });

  assert.notEqual(res.category, 'israel');
  assert.equal(res.isIsraeliVerified, false);
  assert.equal(res.israelSignals.blacklistHits.length > 0, true);
});

test('does not mark non-israel category as verified', () => {
  const res = classifyEvent({
    text: 'NASA launched a new spacecraft and satellite mission',
    pageTitle: 'Science update'
  });

  assert.equal(res.category, 'science');
  assert.equal(res.isIsraeliVerified, false);
});

test('strong signal plus blacklist should not pass israel', () => {
  const res = classifyEvent({
    text: 'Israeli delegation joined an American Jewish community in New York event',
    pageTitle: 'Diaspora and diplomacy'
  });

  assert.equal(res.category, 'general');
  assert.equal(res.isIsraeliVerified, false);
});
