export const correctAnswers = ["A", "C", "B", "D", "A"] as const;

export function scoreAnswers(answers: string[]) {
  const correctCount = correctAnswers.reduce((count, answer, index) => {
    return count + (answers[index] === answer ? 1 : 0);
  }, 0);

  return {
    correctCount,
    score: correctCount * 10
  };
}
