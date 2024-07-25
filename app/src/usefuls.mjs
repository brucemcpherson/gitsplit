export const chunkIt = (inputArray, size) => {
  // like slice
  const end = inputArray.length;
  let start = 0;
  return {
    *[Symbol.iterator]() {
      while (start < end) {
        const chunk = inputArray.slice(start, Math.min(end, size + start));
        start += chunk.length;
        yield chunk;
      }
    },
  };
};

export const timer = (message, startTime) =>
  console.log(
    `${message} completed after ${Math.round(
      (new Date().getTime() - startTime.getTime()) / 1000
    )} secs`
  );