import type { GithubWorkspace } from './github-workspace';

export function analytics(data: GithubWorkspace, days: number, now = new Date()) {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days + 1);
  const previous = new Date(start);
  previous.setDate(previous.getDate() - days);
  const within = (date: string | null, from: Date, to: Date) =>
    !!date && Date.parse(date) >= from.getTime() && Date.parse(date) <= to.getTime();
  const counts = (from: Date, to: Date) => {
    const prs = data.pull_requests.filter((pr) => within(pr.created_at, from, to));
    const reviewed = prs.filter(
      (pr) => pr.first_review_at && Date.parse(pr.first_review_at) >= Date.parse(pr.created_at)
    );
    return {
      commits: data.commits.filter((c) => within(c.at, from, to)).length,
      pulls: prs.length,
      merged: data.pull_requests.filter((pr) => within(pr.merged_at, from, to)).length,
      review_hours: reviewed.length
        ? reviewed.reduce(
            (sum, pr) =>
              sum + (Date.parse(pr.first_review_at!) - Date.parse(pr.created_at)) / 3600000,
            0
          ) / reviewed.length
        : null,
    };
  };
  const current = counts(start, end);
  const prior = counts(previous, new Date(start.getTime() - 1));
  const labels = Array.from({ length: days }, (_, i) => {
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    return date;
  });
  const daily = labels.map((date) => {
    const finish = new Date(date);
    finish.setHours(23, 59, 59, 999);
    return counts(date, finish);
  });
  const authors = [
    ...new Set(data.commits.filter((c) => within(c.at, start, end)).map((c) => c.author)),
  ].map((author) => ({
    name: author,
    avatar: data.commits.find((c) => c.author === author)?.avatar_url ?? null,
    series: labels.map((date) => {
      const finish = new Date(date);
      finish.setHours(23, 59, 59, 999);
      return data.commits.filter((c) => c.author === author && within(c.at, date, finish)).length;
    }),
  }));
  return { current, previous: prior, daily, labels, authors, start, end };
}
