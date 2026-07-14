const prepared = await preparePlatform();
if (!prepared.selected.ok) {
  await emitObservation({
    blocker: prepared.selected.blocker,
    gates: {
      authenticated: failedGate({ reason: 'page unavailable' }),
      draftIdentity: failedGate({ reason: 'page unavailable' }),
      video: failedGate({ reason: 'page unavailable' }),
    },
  });
} else {
  const result = await runPlatformPhase();
  await emitObservation(result);
}
