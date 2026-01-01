const mediasoup = require('mediasoup');
const config = require('../../mediasoup-config');

let worker;

async function getWorker() {
  if (!worker) {
    worker = await mediasoup.createWorker({
      rtcMinPort: config.workerSettings.rtcMinPort,
      rtcMaxPort: config.workerSettings.rtcMaxPort
    });
    console.log(`Mediasoup worker created [pid:${worker.pid}]`);
    worker.on('died', () => {
      console.error('Mediasoup worker died, exiting in 2 seconds...');
      setTimeout(() => process.exit(1), 2000);
    });
  }
  return worker;
}

async function createRouter() {
  const currentWorker = await getWorker();
  return currentWorker.createRouter(config.routerOptions);
}

function closeWorker() {
  if (worker) {
    try {
      worker.close();
    } catch (err) {
      console.warn('Failed to close mediasoup worker', err);
    }
    worker = null;
  }
}

module.exports = {
  getWorker,
  createRouter,
  closeWorker
};
