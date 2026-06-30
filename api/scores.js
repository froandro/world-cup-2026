const https = require('https');

const LEAGUE_ID = 28;
const API_BASE = 'https://apiv3.apifootball.com';

let cache = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 15000 }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('JSON parse error')); }
      });
    }).on('error', reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');

  const now = Date.now();
  if (cache && now - cacheTime < CACHE_TTL) {
    return res.status(200).json(cache);
  }

  const apiKey = process.env.APIFOOTBALL_KEY || '5a05af27da28a7e18a6f7ace888ba0f4b1711c8e8f6065749edec000241fc241';

  try {
    const today = new Date();
    const from = new Date(today);
    from.setDate(from.getDate() - 30);
    const to = new Date(today);
    to.setDate(to.getDate() + 1);

    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);

    const eventsUrl = `${API_BASE}/?action=get_events&from=${fromStr}&to=${toStr}&league_id=${LEAGUE_ID}&APIkey=${apiKey}`;
    const standingsUrl = `${API_BASE}/?action=get_standings&league_id=${LEAGUE_ID}&APIkey=${apiKey}`;

    const [eventsData, standingsData] = await Promise.all([
      fetchJSON(eventsUrl),
      fetchJSON(standingsUrl),
    ]);

    const matches = Array.isArray(eventsData) ? eventsData.map(m => ({
      id: m.match_id,
      date: m.match_date,
      time: m.match_time,
      status: m.match_status,
      home: m.match_hometeam_name,
      away: m.match_awayteam_name,
      homeScore: m.match_hometeam_score,
      awayScore: m.match_awayteam_score,
      goals: Array.isArray(m.goalscorer) ? m.goalscorer.map(g => ({
        player: g.goal_scorer,
        team: g.goal_team,
        minute: g.goal_time,
        homeScore: g.goal_home_score,
        awayScore: g.goal_away_score,
      })) : [],
      videos: Array.isArray(m.videos) ? m.videos.map(v => ({
        title: v.title,
        url: v.url,
      })) : [],
    })) : [];

    const standings = {};
    if (Array.isArray(standingsData)) {
      standingsData.forEach(s => {
        const group = s.league_round || '';
        if (!group.startsWith('Group')) return;
        const g = group.replace('Group ', '');
        if (!standings[g]) standings[g] = [];
        standings[g].push({
          team: s.team_name,
          pos: parseInt(s.overall_league_position) || 0,
          gp: parseInt(s.overall_league_payed) || 0,
          w: parseInt(s.overall_league_W) || 0,
          d: parseInt(s.overall_league_D) || 0,
          l: parseInt(s.overall_league_L) || 0,
          gf: parseInt(s.overall_league_GF) || 0,
          ga: parseInt(s.overall_league_GA) || 0,
          pts: parseInt(s.overall_league_PTS) || 0,
        });
      });
      for (const g of Object.keys(standings)) {
        standings[g].sort((a, b) => a.pos - b.pos);
      }
    }

    cache = { matches, standings, updated: new Date().toISOString() };
    cacheTime = now;

    return res.status(200).json(cache);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
