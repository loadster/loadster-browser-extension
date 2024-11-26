
export function parseRecorderConfig(json) {
  try {
    return JSON.parse(json);
  } catch (err) {
    console.log(err);
    return {};
  }
}
