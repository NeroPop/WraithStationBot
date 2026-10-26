// lib/taskQueue.js
//
// A small helper that makes sure only ONE task runs at a time.
//
// The stim scheduler and the tea alarms both keep a copy of a spreadsheet in memory and
// change it from several places (a repeating check, and slash commands). Without a queue,
// two of those could run at the same moment and trip over each other. This puts them in a line.
//
//   const runExclusive = createQueue();
//   await runExclusive(async () => { ...runs only when nothing else in this queue is running... });

function createQueue() {
  let queue = Promise.resolve();

  return function runExclusive(task) {
    const result = queue.then(task);
    queue = result.catch(() => {}); // a failed task must not block the tasks after it
    return result;
  };
}

module.exports = { createQueue };
