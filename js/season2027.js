/* Saison 2027 : calendrier officiel (annoncé le 16/09/2026, 24 GP, 10 Sprints) et grille provisoire.
   Les horaires de départ sont estimés (heures habituelles de chaque circuit) : l'API live les remplace
   dès qu'elle publie le calendrier 2027. La grille marquée "tbc" n'est pas encore officielle. */
(function (F1) {
  const R = [
    // round, raceName, circuitId, circuitName, locality, country, lat, long, raceUTC (estimé), sprint, tbc
    [1, 'Bahrain Grand Prix', 'bahrain', 'Bahrain International Circuit', 'Sakhir', 'Bahrain', 26.0325, 50.5106, '2027-03-14T15:00:00Z', true],
    [2, 'Saudi Arabian Grand Prix', 'jeddah', 'Jeddah Corniche Circuit', 'Jeddah', 'Saudi Arabia', 21.6319, 39.1044, '2027-03-21T17:00:00Z', false],
    [3, 'Australian Grand Prix', 'albert_park', 'Albert Park Grand Prix Circuit', 'Melbourne', 'Australia', -37.8497, 144.968, '2027-04-04T05:00:00Z', true],
    [4, 'Japanese Grand Prix', 'suzuka', 'Suzuka Circuit', 'Suzuka', 'Japan', 34.8431, 136.541, '2027-04-11T05:00:00Z', true],
    [5, 'Chinese Grand Prix', 'shanghai', 'Shanghai International Circuit', 'Shanghai', 'China', 31.3389, 121.22, '2027-04-18T07:00:00Z', false],
    [6, 'Miami Grand Prix', 'miami', 'Miami International Autodrome', 'Miami', 'USA', 25.9581, -80.2389, '2027-05-02T20:00:00Z', false],
    [7, 'Canadian Grand Prix', 'villeneuve', 'Circuit Gilles Villeneuve', 'Montreal', 'Canada', 45.5, -73.5228, '2027-05-23T18:00:00Z', true],
    [8, 'Monaco Grand Prix', 'monaco', 'Circuit de Monaco', 'Monte-Carlo', 'Monaco', 43.7347, 7.42056, '2027-06-06T13:00:00Z', true],
    [9, 'Portuguese Grand Prix', 'portimao', 'Autódromo Internacional do Algarve', 'Portimão', 'Portugal', 37.227, -8.6267, '2027-06-20T13:00:00Z', false],
    [10, 'British Grand Prix', 'silverstone', 'Silverstone Circuit', 'Silverstone', 'UK', 52.0786, -1.01694, '2027-07-04T14:00:00Z', true],
    [11, 'Austrian Grand Prix', 'red_bull_ring', 'Red Bull Ring', 'Spielberg', 'Austria', 47.2197, 14.7647, '2027-07-11T13:00:00Z', false],
    [12, 'Belgian Grand Prix', 'spa', 'Circuit de Spa-Francorchamps', 'Spa', 'Belgium', 50.4372, 5.97139, '2027-07-25T13:00:00Z', false],
    [13, 'Hungarian Grand Prix', 'hungaroring', 'Hungaroring', 'Budapest', 'Hungary', 47.5789, 19.2486, '2027-08-01T13:00:00Z', false],
    [14, 'Italian Grand Prix', 'monza', 'Autodromo Nazionale di Monza', 'Monza', 'Italy', 45.6156, 9.28111, '2027-09-05T13:00:00Z', true],
    [15, 'Spanish Grand Prix', 'madring', 'Madring', 'Madrid', 'Spain', 40.4637, -3.6163, '2027-09-12T13:00:00Z', false],
    [16, 'Azerbaijan Grand Prix', 'baku', 'Baku City Circuit', 'Baku', 'Azerbaijan', 40.3725, 49.8533, '2027-09-26T11:00:00Z', false],
    [17, 'Turkish Grand Prix', 'istanbul', 'Istanbul Park', 'Istanbul', 'Turkey', 40.9517, 29.405, '2027-10-03T12:00:00Z', false, true],
    [18, 'Singapore Grand Prix', 'marina_bay', 'Marina Bay Street Circuit', 'Marina Bay', 'Singapore', 1.2914, 103.864, '2027-10-10T12:00:00Z', false],
    [19, 'United States Grand Prix', 'americas', 'Circuit of the Americas', 'Austin', 'USA', 30.1328, -97.6411, '2027-10-24T19:00:00Z', false],
    [20, 'Mexico City Grand Prix', 'rodriguez', 'Autódromo Hermanos Rodríguez', 'Mexico City', 'Mexico', 19.4042, -99.0907, '2027-10-31T20:00:00Z', false],
    [21, 'São Paulo Grand Prix', 'interlagos', 'Autódromo José Carlos Pace', 'São Paulo', 'Brazil', -23.7036, -46.6997, '2027-11-07T17:00:00Z', true],
    [22, 'Las Vegas Grand Prix', 'vegas', 'Las Vegas Strip Street Circuit', 'Las Vegas', 'USA', 36.1147, -115.173, '2027-11-21T04:00:00Z', false],
    [23, 'Qatar Grand Prix', 'losail', 'Losail International Circuit', 'Lusail', 'Qatar', 25.49, 51.4542, '2027-12-05T16:00:00Z', true],
    [24, 'Abu Dhabi Grand Prix', 'yas_marina', 'Yas Marina Circuit', 'Abu Dhabi', 'UAE', 24.4672, 54.6031, '2027-12-12T13:00:00Z', true],
  ];
  const T = [
    ['mclaren', 'McLaren', 'British'], ['ferrari', 'Ferrari', 'Italian'], ['red_bull', 'Red Bull', 'Austrian'],
    ['mercedes', 'Mercedes', 'German'], ['aston_martin', 'Aston Martin', 'British'], ['alpine', 'Alpine F1 Team', 'French'],
    ['williams', 'Williams', 'British'], ['rb', 'RB F1 Team', 'Italian'], ['haas', 'Haas F1 Team', 'American'],
    ['audi', 'Audi', 'German'], ['cadillac', 'Cadillac F1 Team', 'American'],
  ];
  // id, code, numéro, prénom, nom, nationalité, écurie, à confirmer ?
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
    ['lawson', 'LAW', '30', 'Liam', 'Lawson', 'New Zealander', 'rb', true],
    ['arvid_lindblad', 'LIN', '41', 'Arvid', 'Lindblad', 'British', 'rb', true],
    ['camara', 'CAM', '', 'Rafael', 'Câmara', 'Brazilian', 'haas'],
    ['bearman', 'BEA', '87', 'Oliver', 'Bearman', 'British', 'haas', true],
    ['hulkenberg', 'HUL', '27', 'Nico', 'Hülkenberg', 'German', 'audi'],
    ['bortoleto', 'BOR', '5', 'Gabriel', 'Bortoleto', 'Brazilian', 'audi'],
    ['perez', 'PER', '11', 'Sergio', 'Pérez', 'Mexican', 'cadillac'],
    ['bottas', 'BOT', '77', 'Valtteri', 'Bottas', 'Finnish', 'cadillac'],
  ];
  F1.SEASONS[2027] = F1.makeSeason(2027, R, D, T);
})(globalThis.F1 = globalThis.F1 || {});
