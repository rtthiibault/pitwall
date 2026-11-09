/* Données embarquées (calendrier + grille 2026) utilisées uniquement si l'API
   live ET le snapshot hebdomadaire sont indisponibles. Format compatible Ergast. */
(function (F1) {
  const R = [
    // round, raceName, circuitId, circuitName, locality, country, lat, long, raceUTC, sprint
    [1, 'Australian Grand Prix', 'albert_park', 'Albert Park Grand Prix Circuit', 'Melbourne', 'Australia', -37.8497, 144.968, '2026-03-08T04:00:00Z', false],
    [2, 'Chinese Grand Prix', 'shanghai', 'Shanghai International Circuit', 'Shanghai', 'China', 31.3389, 121.22, '2026-03-15T07:00:00Z', true],
    [3, 'Japanese Grand Prix', 'suzuka', 'Suzuka Circuit', 'Suzuka', 'Japan', 34.8431, 136.541, '2026-03-29T05:00:00Z', false],
    [4, 'Bahrain Grand Prix', 'bahrain', 'Bahrain International Circuit', 'Sakhir', 'Bahrain', 26.0325, 50.5106, '2026-04-12T15:00:00Z', false],
    [5, 'Saudi Arabian Grand Prix', 'jeddah', 'Jeddah Corniche Circuit', 'Jeddah', 'Saudi Arabia', 21.6319, 39.1044, '2026-04-19T17:00:00Z', false],
    [6, 'Miami Grand Prix', 'miami', 'Miami International Autodrome', 'Miami', 'USA', 25.9581, -80.2389, '2026-05-03T20:00:00Z', true],
    [7, 'Canadian Grand Prix', 'villeneuve', 'Circuit Gilles Villeneuve', 'Montreal', 'Canada', 45.5, -73.5228, '2026-05-24T18:00:00Z', true],
    [8, 'Monaco Grand Prix', 'monaco', 'Circuit de Monaco', 'Monte-Carlo', 'Monaco', 43.7347, 7.42056, '2026-06-07T13:00:00Z', false],
    [9, 'Barcelona-Catalunya Grand Prix', 'catalunya', 'Circuit de Barcelona-Catalunya', 'Montmeló', 'Spain', 41.57, 2.26111, '2026-06-14T13:00:00Z', false],
    [10, 'Austrian Grand Prix', 'red_bull_ring', 'Red Bull Ring', 'Spielberg', 'Austria', 47.2197, 14.7647, '2026-06-28T13:00:00Z', false],
    [11, 'British Grand Prix', 'silverstone', 'Silverstone Circuit', 'Silverstone', 'UK', 52.0786, -1.01694, '2026-07-05T14:00:00Z', true],
    [12, 'Belgian Grand Prix', 'spa', 'Circuit de Spa-Francorchamps', 'Spa', 'Belgium', 50.4372, 5.97139, '2026-07-19T13:00:00Z', false],
    [13, 'Hungarian Grand Prix', 'hungaroring', 'Hungaroring', 'Budapest', 'Hungary', 47.5789, 19.2486, '2026-07-26T13:00:00Z', false],
    [14, 'Dutch Grand Prix', 'zandvoort', 'Circuit Park Zandvoort', 'Zandvoort', 'Netherlands', 52.3888, 4.54092, '2026-08-23T13:00:00Z', true],
    [15, 'Italian Grand Prix', 'monza', 'Autodromo Nazionale di Monza', 'Monza', 'Italy', 45.6156, 9.28111, '2026-09-06T13:00:00Z', false],
    [16, 'Spanish Grand Prix', 'madring', 'Madring', 'Madrid', 'Spain', 40.4637, -3.6163, '2026-09-13T13:00:00Z', false],
    [17, 'Azerbaijan Grand Prix', 'baku', 'Baku City Circuit', 'Baku', 'Azerbaijan', 40.3725, 49.8533, '2026-09-26T11:00:00Z', false],
    [18, 'Singapore Grand Prix', 'marina_bay', 'Marina Bay Street Circuit', 'Marina Bay', 'Singapore', 1.2914, 103.864, '2026-10-11T12:00:00Z', true],
    [19, 'United States Grand Prix', 'americas', 'Circuit of the Americas', 'Austin', 'USA', 30.1328, -97.6411, '2026-10-25T19:00:00Z', false],
    [20, 'Mexico City Grand Prix', 'rodriguez', 'Autódromo Hermanos Rodríguez', 'Mexico City', 'Mexico', 19.4042, -99.0907, '2026-11-01T20:00:00Z', false],
    [21, 'São Paulo Grand Prix', 'interlagos', 'Autódromo José Carlos Pace', 'São Paulo', 'Brazil', -23.7036, -46.6997, '2026-11-08T17:00:00Z', false],
    [22, 'Las Vegas Grand Prix', 'vegas', 'Las Vegas Strip Street Circuit', 'Las Vegas', 'USA', 36.1147, -115.173, '2026-11-22T04:00:00Z', false],
    [23, 'Qatar Grand Prix', 'losail', 'Losail International Circuit', 'Lusail', 'Qatar', 25.49, 51.4542, '2026-11-29T16:00:00Z', false],
    [24, 'Abu Dhabi Grand Prix', 'yas_marina', 'Yas Marina Circuit', 'Abu Dhabi', 'UAE', 24.4672, 54.6031, '2026-12-06T13:00:00Z', false],
  ];
  const T = [
    ['mclaren', 'McLaren', 'British'], ['ferrari', 'Ferrari', 'Italian'], ['red_bull', 'Red Bull', 'Austrian'],
    ['mercedes', 'Mercedes', 'German'], ['aston_martin', 'Aston Martin', 'British'], ['alpine', 'Alpine F1 Team', 'French'],
    ['williams', 'Williams', 'British'], ['rb', 'RB F1 Team', 'Italian'], ['haas', 'Haas F1 Team', 'American'],
    ['audi', 'Audi', 'German'], ['cadillac', 'Cadillac F1 Team', 'American'],
  ];
  const D = [
    ['norris', 'NOR', '1', 'Lando', 'Norris', 'British', 'mclaren'],
    ['piastri', 'PIA', '81', 'Oscar', 'Piastri', 'Australian', 'mclaren'],
    ['leclerc', 'LEC', '16', 'Charles', 'Leclerc', 'Monegasque', 'ferrari'],
    ['hamilton', 'HAM', '44', 'Lewis', 'Hamilton', 'British', 'ferrari'],
    ['max_verstappen', 'VER', '3', 'Max', 'Verstappen', 'Dutch', 'red_bull'],
    ['hadjar', 'HAD', '6', 'Isack', 'Hadjar', 'French', 'red_bull'],
    ['russell', 'RUS', '63', 'George', 'Russell', 'British', 'mercedes'],
    ['antonelli', 'ANT', '12', 'Andrea Kimi', 'Antonelli', 'Italian', 'mercedes'],
    ['alonso', 'ALO', '14', 'Fernando', 'Alonso', 'Spanish', 'aston_martin'],
    ['stroll', 'STR', '18', 'Lance', 'Stroll', 'Canadian', 'aston_martin'],
    ['gasly', 'GAS', '10', 'Pierre', 'Gasly', 'French', 'alpine'],
    ['colapinto', 'COL', '43', 'Franco', 'Colapinto', 'Argentine', 'alpine'],
    ['albon', 'ALB', '23', 'Alexander', 'Albon', 'Thai', 'williams'],
    ['sainz', 'SAI', '55', 'Carlos', 'Sainz', 'Spanish', 'williams'],
    ['lawson', 'LAW', '30', 'Liam', 'Lawson', 'New Zealander', 'rb'],
    ['arvid_lindblad', 'LIN', '41', 'Arvid', 'Lindblad', 'British', 'rb'],
    ['ocon', 'OCO', '31', 'Esteban', 'Ocon', 'French', 'haas'],
    ['bearman', 'BEA', '87', 'Oliver', 'Bearman', 'British', 'haas'],
    ['hulkenberg', 'HUL', '27', 'Nico', 'Hülkenberg', 'German', 'audi'],
    ['bortoleto', 'BOR', '5', 'Gabriel', 'Bortoleto', 'Brazilian', 'audi'],
    ['perez', 'PER', '11', 'Sergio', 'Pérez', 'Mexican', 'cadillac'],
    ['bottas', 'BOT', '77', 'Valtteri', 'Bottas', 'Finnish', 'cadillac'],
  ];
  F1.makeSeason = function (year, R, D, T) {
    const teamObj = (id) => { const t = T.find((x) => x[0] === id); return { constructorId: t[0], name: t[1], nationality: t[2] }; };
    const shift = (iso, h) => { const d = new Date(new Date(iso).getTime() + h * 3600e3); return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 19) + 'Z' }; };
    return {
      year,
      schedule: R.map((r) => {
        const race = shift(r[8], 0);
        const o = {
          season: String(year), round: String(r[0]), raceName: r[1],
          Circuit: { circuitId: r[2], circuitName: r[3], Location: { lat: String(r[6]), long: String(r[7]), locality: r[4], country: r[5] } },
          date: race.date, time: race.time,
          FirstPractice: shift(r[8], -48),
          Qualifying: shift(r[8], r[9] ? -24 : -25),
        };
        if (r[9]) { o.SprintQualifying = shift(r[8], -44); o.Sprint = shift(r[8], -28); }
        else { o.SecondPractice = shift(r[8], -44.5); o.ThirdPractice = shift(r[8], -28.5); }
        if (r[10]) o.tbc = true;
        return o;
      }),
      driverStandings: D.map((d, i) => ({
        position: String(i + 1), positionText: String(i + 1), points: '0', wins: '0',
        Driver: { driverId: d[0], code: d[1], permanentNumber: d[2], givenName: d[3], familyName: d[4], nationality: d[5] },
        Constructors: [teamObj(d[6])], tbc: !!d[7],
      })),
      constructorStandings: T.map((t, i) => ({ position: String(i + 1), points: '0', wins: '0', Constructor: teamObj(t[0]) })),
      results: [], sprint: [], qualifying: [], embedded: true,
    };
  };
  F1.SEASONS = F1.SEASONS || {};
  F1.SEASONS[2026] = F1.makeSeason(2026, R, D, T);
  F1.FALLBACK = F1.SEASONS[2026];
})(globalThis.F1 = globalThis.F1 || {});
