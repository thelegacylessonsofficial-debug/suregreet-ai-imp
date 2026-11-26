import * as cheerio from 'cheerio';
import { fetchJinaMarkdown, runDigitalAudit } from './auditorService.js';
import { addProspect, getProspectById, updateProspect, getProspects } from './outreachService.js';
import { scrapeClinicWebsite, normalizeUrl } from './scraperService.js';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/**
 * High-Ticket Search Queries per Trade Niche (Emergency Services & High Replacement Tickets)
 */
const NICHE_QUERIES = {
  hvac: [
    'Emergency HVAC Repair',
    '24/7 AC Repair Commercial Heating',
    'Air Conditioning Replacement Installation',
    'Emergency Furnace and Heat Pump Repair',
  ],
  plumbing: [
    '24/7 Emergency Plumbing Repair',
    'Emergency Drain Cleaning and Sewer Line',
    'Commercial Water Heater Replacement',
    'Emergency Burst Pipe Plumber',
  ],
  roofing: [
    'Emergency Roof Repair Tarping',
    'Commercial and Residential Roof Replacement',
    'Storm Damage Roof Restoration',
    'Emergency Roofing Contractor 24/7',
  ],
  electrical: [
    '24/7 Emergency Electrician Repair',
    'Commercial Electrical Service Panel Upgrade',
    'Whole Home Generator Installation',
    'Emergency Electrical Contractor',
  ],
  water_damage: [
    '24/7 Emergency Water Damage Restoration',
    'Flood Extraction and Structural Drying',
    'Emergency Fire and Water Damage Cleanup',
  ],
  medspa: [
    'MedSpa Morpheus8',
    'Medical Aesthetics Botox',
  ],
};

/**
 * Archit's Systematic Territory Cascade:
 * Phase 1: PACIFIC TIMEZONE (CA -> WA -> OR -> NV) - Top 5 Cities Each
 * Phase 2: EASTERN TIMEZONE (FL -> NY -> GA) - Top 5 Cities Each
 * Phase 3: Secondary Tier Cities (Exhaust Pacific then Eastern)
 */
export const TERRITORY_CASCADE = {
  pacific: {
    name: 'Pacific Timezone (PT)',
    order: 1,
    states: {
      CA: {
        name: 'California',
        topTier: ['Los Angeles, CA', 'San Diego, CA', 'San Jose, CA', 'San Francisco, CA', 'Fresno, CA'],
        secondaryTier: [
          'Sacramento, CA', 'Long Beach, CA', 'Oakland, CA', 'Bakersfield, CA', 'Anaheim, CA',
          'Stockton, CA', 'Riverside, CA', 'Irvine, CA', 'Chula Vista, CA', 'Santa Clarita, CA',
          'San Bernardino, CA', 'Modesto, CA', 'Moreno Valley, CA', 'Oxnard, CA', 'Santa Rosa, CA'
        ]
      },
      WA: {
        name: 'Washington',
        topTier: ['Seattle, WA', 'Spokane, WA', 'Tacoma, WA', 'Vancouver, WA', 'Bellevue, WA'],
        secondaryTier: [
          'Kent, WA', 'Everett, WA', 'Spokane Valley, WA', 'Renton, WA', 'Federal Way, WA',
          'Yakima, WA', 'Kirkland, WA', 'Bellingham, WA', 'Kennewick, WA', 'Auburn, WA',
          'Pasco, WA', 'Richland, WA', 'Shoreline, WA', 'Sammamish, WA', 'Lakewood, WA'
        ]
      },
      OR: {
        name: 'Oregon',
        topTier: ['Portland, OR', 'Eugene, OR', 'Salem, OR', 'Gresham, OR', 'Hillsboro, OR'],
        secondaryTier: [
          'Beaverton, OR', 'Bend, OR', 'Medford, OR', 'Springfield, OR', 'Corvallis, OR',
          'Albany, OR', 'Tigard, OR', 'Lake Oswego, OR', 'Keizer, OR', 'Oregon City, OR',
          'Redmond, OR', 'Grants Pass, OR', 'West Linn, OR', 'Sherwood, OR', 'Newberg, OR'
        ]
      },
      NV: {
        name: 'Nevada',
        topTier: ['Las Vegas, NV', 'Henderson, NV', 'North Las Vegas, NV', 'Reno, NV', 'Sparks, NV'],
        secondaryTier: [
          'Enterprise, NV', 'Spring Valley, NV', 'Sunrise Manor, NV', 'Paradise, NV', 'Carson City, NV',
          'Whitney, NV', 'Pahrump, NV', 'Winchester, NV', 'Summerlin South, NV', 'Fernley, NV',
          'Sun Valley, NV', 'Mesquite, NV', 'Elko, NV', 'Spanish Springs, NV', 'Dayton, NV'
        ]
      }
    }
  },
  eastern: {
    name: 'Eastern Timezone (ET)',
    order: 2,
    states: {
      FL: {
        name: 'Florida',
        topTier: ['Jacksonville, FL', 'Miami, FL', 'Tampa, FL', 'Orlando, FL', 'St. Petersburg, FL'],
        secondaryTier: [
          'Port St. Lucie, FL', 'Cape Coral, FL', 'Hialeah, FL', 'Tallahassee, FL', 'Fort Lauderdale, FL',
          'Pembroke Pines, FL', 'Hollywood, FL', 'Miramar, FL', 'Gainesville, FL', 'Coral Springs, FL',
          'Clearwater, FL', 'Palm Bay, FL', 'West Palm Beach, FL'
        ]
      },
      NY: {
        name: 'New York',
        topTier: ['New York City, NY', 'Buffalo, NY', 'Rochester, NY', 'Yonkers, NY', 'Syracuse, NY'],
        secondaryTier: [
          'Albany, NY', 'New Rochelle, NY', 'Mount Vernon, NY', 'Schenectady, NY', 'Utica, NY',
          'White Plains, NY', 'Troy, NY', 'Niagara Falls, NY', 'Binghamton, NY', 'Freeport, NY',
          'Valley Stream, NY', 'Long Beach, NY', 'Poughkeepsie, NY'
        ]
      },
      GA: {
        name: 'Georgia',
        topTier: ['Atlanta, GA', 'Augusta, GA', 'Columbus, GA', 'Macon, GA', 'Savannah, GA'],
        secondaryTier: [
          'Athens, GA', 'Sandy Springs, GA', 'South Fulton, GA', 'Roswell, GA', 'Warner Robins, GA',
          'Albany, GA', 'Johns Creek, GA', 'Alpharetta, GA', 'Marietta, GA', 'Stonecrest, GA',
          'Smyrna, GA', 'Valdosta, GA', 'Dunwoody, GA', 'Brookhaven, GA'
        ]
      },
      IN: {
        name: 'Indiana',
        topTier: ['Carmel, IN', 'Zionsville, IN'],
        secondaryTier: ['Indianapolis, IN', 'Fishers, IN', 'Westfield, IN', 'Noblesville, IN']
      },
      OH: {
        name: 'Ohio',
        topTier: ['Dublin, OH'],
        secondaryTier: ['Columbus, OH', 'Powell, OH', 'Westerville, OH', 'New Albany, OH']
      },
      TX: {
        name: 'Texas (Affluent Suburbs)',
        topTier: ['Prosper, TX', 'Celina, TX', 'Fulshear, TX'],
        secondaryTier: ['Frisco, TX', 'McKinney, TX', 'Allen, TX', 'Katy, TX', 'Sugar Land, TX']
      },
      TN: {
        name: 'Tennessee',
        topTier: ['Brentwood, TN'],
        secondaryTier: ['Nashville, TN', 'Franklin, TN', 'Murfreesboro, TN', 'Nolensville, TN']
      }
    }
  }
};

/**
 * Deterministic ordered cascade of top priority cities across Pacific then Eastern
 */
export const ORDERED_CASCADE_CITIES = [
  // 1. Pacific Top 5 Each (Total: 20)
  ...TERRITORY_CASCADE.pacific.states.CA.topTier,
  ...TERRITORY_CASCADE.pacific.states.WA.topTier,
  ...TERRITORY_CASCADE.pacific.states.OR.topTier,
  ...TERRITORY_CASCADE.pacific.states.NV.topTier,
  // 2. Eastern Top 5 Each (Total: 15)
  ...TERRITORY_CASCADE.eastern.states.FL.topTier,
  ...TERRITORY_CASCADE.eastern.states.NY.topTier,
  ...TERRITORY_CASCADE.eastern.states.GA.topTier,
  // 3. NEW: High-Income Suburban Markets (Phase 3 Priority)
  ...TERRITORY_CASCADE.eastern.states.IN.topTier,   // Carmel & Zionsville, IN
  ...TERRITORY_CASCADE.eastern.states.OH.topTier,   // Dublin, OH
  ...TERRITORY_CASCADE.eastern.states.TX.topTier,   // Prosper, Celina, Fulshear, TX
  ...TERRITORY_CASCADE.eastern.states.TN.topTier,   // Brentwood, TN
  // 4. Pacific Secondary Tier
  ...TERRITORY_CASCADE.pacific.states.CA.secondaryTier,
  ...TERRITORY_CASCADE.pacific.states.WA.secondaryTier,
  ...TERRITORY_CASCADE.pacific.states.OR.secondaryTier,
  ...TERRITORY_CASCADE.pacific.states.NV.secondaryTier,
  // 5. Eastern Secondary Tier
  ...TERRITORY_CASCADE.eastern.states.FL.secondaryTier,
  ...TERRITORY_CASCADE.eastern.states.NY.secondaryTier,
  ...TERRITORY_CASCADE.eastern.states.GA.secondaryTier,
  ...TERRITORY_CASCADE.eastern.states.IN.secondaryTier,
  ...TERRITORY_CASCADE.eastern.states.OH.secondaryTier,
  ...TERRITORY_CASCADE.eastern.states.TX.secondaryTier,
  ...TERRITORY_CASCADE.eastern.states.TN.secondaryTier,
];

export function getNextCascadeCity(currentCity) {
  if (!currentCity) return ORDERED_CASCADE_CITIES[0];
  const idx = ORDERED_CASCADE_CITIES.findIndex(c => c.toLowerCase().includes(currentCity.toLowerCase()) || currentCity.toLowerCase().includes(c.toLowerCase()));
  if (idx === -1 || idx === ORDERED_CASCADE_CITIES.length - 1) {
    return ORDERED_CASCADE_CITIES[0];
  }
  return ORDERED_CASCADE_CITIES[idx + 1];
}

/**
 * Fallback Curated High-Ticket Target Domains per Metro (Used if search engine blocks cloud datacenter IP)
 */
const CURATED_TARGETS = {
  medspa: {
    miami: [
      { title: 'Med Aesthetics Miami', url: 'https://www.medaestheticsmiami.com', city: 'Miami, FL' },
      { title: 'Aglow Medical & MedSpa Miami Lakes', url: 'https://aglowmiami.com', city: 'Miami, FL' },
      { title: 'Microneedling & Morpheus8 Miami Center', url: 'https://microneedlingmiamicenter.com', city: 'Miami, FL' },
      { title: 'Hochstein Medspa Miami Beach', url: 'https://www.lhochsteinmd.com', city: 'Miami, FL' },
      { title: 'DermaCare Brickell Laser & MedSpa', url: 'https://dermacarebrickell.com', city: 'Miami, FL' },
    ],
    dallas: [
      { title: 'Vitalyc Medspa Dallas', url: 'https://www.vitalyc.com', city: 'Dallas, TX' },
      { title: 'Rejuve Med-Spa Dallas', url: 'https://www.rejuvemedspa.com', city: 'Dallas, TX' },
      { title: 'EpiCentre Skin Care & Laser Dallas', url: 'https://www.epicentreskincare.com', city: 'Dallas, TX' },
      { title: 'Lumea Med Spa Dallas', url: 'https://lumeamedspa.com', city: 'Dallas, TX' },
      { title: 'Dallas Plastic Surgery Institute MedSpa', url: 'https://dpsi.org', city: 'Dallas, TX' },
    ],
    phoenix: [
      { title: 'Vibrant Skin Bar Phoenix', url: 'https://vibrantskinbar.com', city: 'Phoenix, AZ' },
      { title: 'Scottsdale Skin & Holistic MedSpa', url: 'https://scottsdalemedspa.com', city: 'Phoenix, AZ' },
      { title: 'Skin Science Institute Phoenix', url: 'https://skinscienceinstitute.com', city: 'Phoenix, AZ' },
      { title: 'Sculpted Contours MedSpa Phoenix', url: 'https://sculptedcontours.com', city: 'Phoenix, AZ' },
      { title: 'Beverly Hills Rejuvenation Center Scottsdale', url: 'https://bhrcenter.com', city: 'Phoenix, AZ' },
      { title: 'Skin Cabinet MedSpa Phoenix', url: 'https://skincabinet.com', city: 'Phoenix, AZ' },
    ],
    scottsdale: [
      { title: 'Vibrant Skin Bar Scottsdale', url: 'https://vibrantskinbar.com', city: 'Scottsdale, AZ' },
      { title: 'Scottsdale Skin & Holistic MedSpa', url: 'https://scottsdalemedspa.com', city: 'Scottsdale, AZ' },
      { title: 'Beverly Hills Rejuvenation Center Scottsdale', url: 'https://bhrcenter.com', city: 'Scottsdale, AZ' },
      { title: 'Skin Cabinet MedSpa Scottsdale', url: 'https://skincabinet.com', city: 'Scottsdale, AZ' },
    ],
    austin: [
      { title: 'Elevate Body & Face Medspa Austin', url: 'https://www.elevatemedspa.com', city: 'Austin, TX' },
      { title: 'Viva Day Spa + Med Spa Austin', url: 'https://www.vivadayspa.com', city: 'Austin, TX' },
      { title: 'Beleza Surgery & Medspa Austin', url: 'https://belezasurgery.com', city: 'Austin, TX' },
      { title: 'Austin Medspa', url: 'https://austinmedspa.com', city: 'Austin, TX' },
      { title: 'Restoration MedSpa Austin', url: 'https://restorationmedspa.com', city: 'Austin, TX' },
    ],
    atlanta: [
      { title: 'ELLEMES Medical Spa Atlanta', url: 'https://www.ellemesmedspa.com', city: 'Atlanta, GA' },
      { title: 'Atlanta Skin & Beauty Clinic', url: 'https://www.atlantaskinwellnesscenter.com', city: 'Atlanta, GA' },
      { title: 'Skin IQ Medspa Atlanta', url: 'https://skiniqmedspa.com', city: 'Atlanta, GA' },
      { title: 'Aya Medical Spa Atlanta', url: 'https://ayaskincare.com', city: 'Atlanta, GA' },
    ],
    houston: [
      { title: 'SkinCeuticals SkinLab Houston', url: 'https://skinlabhouston.com', city: 'Houston, TX' },
      { title: 'Clinic 45 Medical Spa Houston', url: 'https://clinic45.com', city: 'Houston, TX' },
      { title: 'Heights Med Spa Houston', url: 'https://heightsmedspa.com', city: 'Houston, TX' },
      { title: 'DermaTouch RN MedSpa Houston', url: 'https://dermatouchrn.com', city: 'Houston, TX' },
    ],
    'los angeles': [
      { title: 'Beverly Hills Rejuvenation Center LA', url: 'https://bhrcenter.com', city: 'Los Angeles, CA' },
      { title: 'Westside Aesthetics Los Angeles', url: 'https://westsideaesthetics.com', city: 'Los Angeles, CA' },
      { title: 'Motykie Med Spa Beverly Hills', url: 'https://motykiemedspa.com', city: 'Los Angeles, CA' },
    ],
    orlando: [
      { title: 'LightTouch Med Spa Orlando', url: 'https://lighttouchmedspa.com', city: 'Orlando, FL' },
      { title: 'Fiala Aesthetics Medical Spa Orlando', url: 'https://medspaorlando.com', city: 'Orlando, FL' },
      { title: 'Winter Park Laser & MedSpa Orlando', url: 'https://winterparklaser.com', city: 'Orlando, FL' },
    ],
    tampa: [
      { title: 'Tampa Bay Body Sculpting MedSpa', url: 'https://tampabaybodysculpting.com', city: 'Tampa, FL' },
      { title: 'Academic Alliance Medspa Tampa', url: 'https://academicaesthetics.com', city: 'Tampa, FL' },
    ],
    denver: [
      { title: 'Atagi Plastic Surgery & Skin Denver', url: 'https://atagimd.com', city: 'Denver, CO' },
      { title: 'The Med Spa at Cherry Creek Denver', url: 'https://cherrycreekmedspa.com', city: 'Denver, CO' },
    ],
    chicago: [
      { title: 'Gold Coast Plastic Surgery & Medspa Chicago', url: 'https://goldcoastplasticsurgery.com', city: 'Chicago, IL' },
      { title: 'Whole Beauty Medical Spa Chicago', url: 'https://wholebeauty.com', city: 'Chicago, IL' },
    ],
    'new york': [
      { title: 'Tribeca MedSpa NYC', url: 'https://tribecamedspa.com', city: 'New York, NY' },
      { title: 'Skin Spa New York', url: 'https://skinspanewyork.com', city: 'New York, NY' },
    ],
    'san diego': [
      { title: 'San Diego Cosmetic Laser Clinic', url: 'https://sandiegolaserclinic.com', city: 'San Diego, CA' },
      { title: 'Siti Med Spa San Diego', url: 'https://sitimedspa.com', city: 'San Diego, CA' },
      { title: 'Laser Clinique San Diego', url: 'https://laser-clinique.com', city: 'San Diego, CA' },
      { title: 'SD Body Contouring & Medspa', url: 'https://sdbody.com', city: 'San Diego, CA' },
    ],
    'san francisco': [
      { title: 'Epi Center MedSpa San Francisco', url: 'https://epicenter.com', city: 'San Francisco, CA' },
      { title: 'SkinSpirit San Francisco', url: 'https://skinspirit.com', city: 'San Francisco, CA' },
      { title: 'Uptown Medical Aesthetics SF', url: 'https://uptownmedicalaesthetics.com', city: 'San Francisco, CA' },
    ],
    'las vegas': [
      { title: 'Chic La Vie Med Spa Las Vegas', url: 'https://chiclavie.com', city: 'Las Vegas, NV' },
      { title: 'Nuance Aesthetics & MedSpa Las Vegas', url: 'https://nuancemedspa.com', city: 'Las Vegas, NV' },
    ],
    seattle: [
      { title: 'Vida Aesthetic Medicine Seattle', url: 'https://thinkvida.com', city: 'Seattle, WA' },
      { title: 'Penelope and the Beauty Bar Seattle', url: 'https://penelopeandthebeautybar.com', city: 'Seattle, WA' },
    ],
    nashville: [
      { title: 'Kaya Med Spa Nashville', url: 'https://kayamedspa.com', city: 'Nashville, TN' },
      { title: 'The Lotus Room Medspa Nashville', url: 'https://thelotusroomnashville.com', city: 'Nashville, TN' },
    ],
    charlotte: [
      { title: 'Carolina Facial Plastics MedSpa Charlotte', url: 'https://carolinafacialplasticsurgery.com', city: 'Charlotte, NC' },
    ],
    boston: [
      { title: 'Luminosity Medspa Boston', url: 'https://luminositymedspa.com', city: 'Boston, MA' },
      { title: 'Skin Spa New York Boston', url: 'https://skinspanewyork.com', city: 'Boston, MA' },
      { title: 'Boston Medical Aesthetics', url: 'https://bostonmedicalaesthetics.com', city: 'Boston, MA' },
    ],
    philadelphia: [
      { title: 'Ringpfeil Advanced Dermatology Medspa Philly', url: 'https://ringpfeildermatology.com', city: 'Philadelphia, PA' },
      { title: 'Subbio Plastic Surgery & MedSpa Philly', url: 'https://drsubbio.com', city: 'Philadelphia, PA' },
      { title: 'About Face Skin Care Philadelphia', url: 'https://aboutfaceskincare.com', city: 'Philadelphia, PA' },
    ],
    'washington dc': [
      { title: 'Bruno Plastic Surgery & MedSpa Washington DC', url: 'https://brunoplasticsurgery.com', city: 'Washington, DC' },
    ],
    portland: [
      { title: 'Portland Face Doctor & MedSpa', url: 'https://portlandfacedoctor.com', city: 'Portland, OR' },
      { title: 'The Fix Clinic MedSpa Portland', url: 'https://thefixclinic.com', city: 'Portland, OR' },
      { title: 'Skin by Lovely Portland', url: 'https://skinbylovely.com', city: 'Portland, OR' },
    ],
    jacksonville: [
      { title: 'First Coast Medical MedSpa Jacksonville', url: 'https://firstcoastmed.com', city: 'Jacksonville, FL' },
      { title: 'Pure Med Spa Jacksonville', url: 'https://puremedspajax.com', city: 'Jacksonville, FL' },
    ],
    'san jose': [
      { title: 'San Jose Medical Spa', url: 'https://sanjosemedspa.com', city: 'San Jose, CA' },
      { title: 'Silicon Valley Aesthetic Dermatology', url: 'https://siliconvalleyderm.com', city: 'San Jose, CA' },
    ],
    fresno: [
      { title: 'Fresno Medical Aesthetics & Laser', url: 'https://fresnomedaesthetics.com', city: 'Fresno, CA' },
      { title: 'Valley Skin Care & MedSpa Fresno', url: 'https://valleyskincarefresno.com', city: 'Fresno, CA' },
    ],
    spokane: [
      { title: 'Spokane Plastic Surgery & MedSpa', url: 'https://spokaneplasticsurgery.com', city: 'Spokane, WA' },
      { title: 'Craft Medical Aesthetics Spokane', url: 'https://craftmedicalaesthetics.com', city: 'Spokane, WA' },
    ],
    reno: [
      { title: 'Reno Tahoe Plastic Surgery & MedSpa', url: 'https://renotahoeplasticsurgery.com', city: 'Reno, NV' },
      { title: 'Sierra Aesthetics MedSpa Reno', url: 'https://sierraaestheticsreno.com', city: 'Reno, NV' },
    ],
    buffalo: [
      { title: 'Buffalo Aesthetics & Laser Clinic', url: 'https://buffalomedspa.com', city: 'Buffalo, NY' },
    ],
    savannah: [
      { title: 'Savannah Plastic Surgery & MedSpa', url: 'https://savannahplasticsurgery.com', city: 'Savannah, GA' },
      { title: 'Glow Medical Spa Savannah', url: 'https://glowmedspasavannah.com', city: 'Savannah, GA' },
    ],
  },
  hvac: {
    phoenix: [
      { title: 'Champion Air 24/7 Emergency AC Phoenix', url: 'https://www.championair.com', city: 'Phoenix, AZ' },
      { title: 'George Brazil HVAC Phoenix', url: 'https://georgebrazilhvac.com', city: 'Phoenix, AZ' },
      { title: 'Morehart Air Conditioning & Heating Phoenix', url: 'https://morehartac.com', city: 'Phoenix, AZ' },
      { title: 'Compass Air Conditioning & Furnace Repair', url: 'https://azcompassair.com', city: 'Phoenix, AZ' },
    ],
    dallas: [
      { title: 'Lex Air Conditioning & Heating 24/7 Emergency Dallas', url: 'https://www.lexairconditioning.com', city: 'Dallas, TX' },
      { title: 'Total Air & Heat 24/7 Emergency Dallas', url: 'https://www.totalair.com', city: 'Dallas, TX' },
      { title: 'Berkeys Air Conditioning & Plumbing', url: 'https://www.berkeys.com', city: 'Dallas, TX' },
      { title: 'Baker Brothers Plumbing & HVAC Dallas', url: 'https://www.bakerbrothersplumbing.com', city: 'Dallas, TX' },
    ],
    miami: [
      { title: 'Direct Air Conditioning & Emergency HVAC Miami', url: 'https://www.directairfl.com', city: 'Miami, FL' },
      { title: 'Air Around the Clock 24/7 HVAC South Florida', url: 'https://www.airaroundtheclock.com', city: 'Miami, FL' },
      { title: 'Freezing Mechanical Air Conditioning Miami', url: 'https://freezingmechanical.com', city: 'Miami, FL' },
      { title: 'All Year Cooling & Heating South Florida', url: 'https://allyearcooling.com', city: 'Miami, FL' },
    ],
    austin: [
      { title: 'Fox Service Company 24/7 HVAC Austin', url: 'https://foxservice.com', city: 'Austin, TX' },
      { title: 'Totally Cool AC 24/7 Emergency Austin', url: 'https://www.totallycoolac.com', city: 'Austin, TX' },
      { title: 'McCullough Heating & Air Austin', url: 'https://www.mcculloughair.com', city: 'Austin, TX' },
    ],
    atlanta: [
      { title: 'PV Heating, Cooling & Plumbing Atlanta', url: 'https://pvhvac.com', city: 'Atlanta, GA' },
      { title: 'Anchor Heating & Air 24/7 Emergency Atlanta', url: 'https://www.anchorac.com', city: 'Atlanta, GA' },
      { title: 'Reliable Heating & Air Atlanta', url: 'https://reliableair.com', city: 'Atlanta, GA' },
    ],
    tampa: [
      { title: 'Cornerstone Pros Air Conditioning Tampa', url: 'https://cornerstonepros.com', city: 'Tampa, FL' },
      { title: 'Air Hawk Heating and Cooling Tampa', url: 'https://airhawkac.com', city: 'Tampa, FL' },
    ],
    houston: [
      { title: 'Airteam HVAC Houston', url: 'https://airteam.com', city: 'Houston, TX' },
      { title: 'Custom Comfort Air Houston', url: 'https://customcomfortair.com', city: 'Houston, TX' },
      { title: 'John Moore Services HVAC Houston', url: 'https://johnmooreservices.com', city: 'Houston, TX' },
    ],
    'los angeles': [
      { title: 'Around the Clock Heating & Air Conditioning LA', url: 'https://aroundtheclockair.com', city: 'Los Angeles, CA' },
      { title: 'JW Plumbing, Heating and Air Los Angeles', url: 'https://jwheatingandair.com', city: 'Los Angeles, CA' },
    ],
    'san diego': [
      { title: 'Anderson Plumbing Heating & Air San Diego', url: 'https://andersonpha.com', city: 'San Diego, CA' },
      { title: 'Bill Howe Plumbing Heating & Air San Diego', url: 'https://billhowe.com', city: 'San Diego, CA' },
    ],
    'san francisco': [
      { title: 'Atlas Heating & Air Conditioning SF', url: 'https://atlasheating.com', city: 'San Francisco, CA' },
      { title: 'Bellows Plumbing, Heating & Air', url: 'https://bellowsservice.com', city: 'San Francisco, CA' },
    ],
    'las vegas': [
      { title: 'Sierra Air Conditioning & Plumbing Las Vegas', url: 'https://sierraairconditioning.com', city: 'Las Vegas, NV' },
      { title: 'Goettl Air Conditioning & Plumbing Las Vegas', url: 'https://goettl.com', city: 'Las Vegas, NV' },
    ],
    seattle: [
      { title: 'Bob\'s Heating & Air Conditioning Seattle', url: 'https://bobsheating.com', city: 'Seattle, WA' },
      { title: 'BelRed Energy Solutions Seattle', url: 'https://belred.com', city: 'Seattle, WA' },
    ],
    denver: [
      { title: 'AAA Heating & Air Conditioning Denver', url: 'https://aaaheating.com', city: 'Denver, CO' },
      { title: 'Swan Heating & Air Denver', url: 'https://swanheating.com', city: 'Denver, CO' },
    ],
    orlando: [
      { title: 'Del-Air Heating & Air Conditioning Orlando', url: 'https://delair.com', city: 'Orlando, FL' },
      { title: 'Ferran Services Air Conditioning Orlando', url: 'https://ferran-services.com', city: 'Orlando, FL' },
    ],
    nashville: [
      { title: 'Lee Company 24/7 HVAC Nashville', url: 'https://leecompany.com', city: 'Nashville, TN' },
      { title: 'Hiller Plumbing, Heating & Air Nashville', url: 'https://happyhiller.com', city: 'Nashville, TN' },
    ],
    charlotte: [
      { title: 'Morris-Jenkins 24/7 HVAC Charlotte', url: 'https://morrisjenkins.com', city: 'Charlotte, NC' },
      { title: 'Brother Heating & Air Charlotte', url: 'https://brotherair.com', city: 'Charlotte, NC' },
    ],
    chicago: [
      { title: 'Four Seasons Heating & Cooling Chicago', url: 'https://www.fourseasonsheatingcooling.com', city: 'Chicago, IL' },
      { title: 'Deljo Heating & Cooling Chicago', url: 'https://deljoheating.com', city: 'Chicago, IL' },
    ],
    boston: [
      { title: 'Boston Standard Plumbing & HVAC', url: 'https://bostonstandardplumbing.com', city: 'Boston, MA' },
      { title: '128 Plumbing Heating Cooling Boston', url: 'https://call128.com', city: 'Boston, MA' },
    ],
    philadelphia: [
      { title: 'Oliver Heating & Cooling Philadelphia', url: 'https://oliverheatcool.com', city: 'Philadelphia, PA' },
      { title: 'Eby Emergency HVAC Philadelphia', url: 'https://ebyhvac.com', city: 'Philadelphia, PA' },
    ],
    'new york': [
      { title: 'Manhattan Cooling & Heating NYC', url: 'https://manhattancooling.com', city: 'New York, NY' },
      { title: 'Air Repair Queens & NYC', url: 'https://airrepair.com', city: 'New York, NY' },
    ],
    'washington dc': [
      { title: 'F.H. Furr Plumbing, Heating & Air DC', url: 'https://fhfurr.com', city: 'Washington, DC' },
      { title: 'Magnolia Plumbing, Heating & Cooling DC', url: 'https://magnoliacompanies.com', city: 'Washington, DC' },
    ],
    portland: [
      { title: 'Sky Heating, AC & Plumbing Portland', url: 'https://skyheating.com', city: 'Portland, OR' },
      { title: 'Pyramid Heating & Cooling Portland', url: 'https://pyramidheating.com', city: 'Portland, OR' },
    ],
    jacksonville: [
      { title: 'Snyder Air Conditioning & Plumbing Jax', url: 'https://snyderac.com', city: 'Jacksonville, FL' },
      { title: 'Von\'s Heating and Air Jacksonville', url: 'https://vonsheatingandair.com', city: 'Jacksonville, FL' },
    ],
    'san jose': [
      { title: 'Pelle Heating & Air Conditioning San Jose', url: 'https://pellehvac.com', city: 'San Jose, CA' },
    ],
    spokane: [
      { title: 'Holiday Heating & Air Conditioning Spokane', url: 'https://holidayheating.com', city: 'Spokane, WA' },
    ],
    reno: [
      { title: 'Lincoln Heating & Air Conditioning Reno', url: 'https://lincolnheating.com', city: 'Reno, NV' },
    ],
    buffalo: [
      { title: 'Roy\'s Plumbing, Heating & Cooling Buffalo', url: 'https://callroys.com', city: 'Buffalo, NY' },
    ],
    savannah: [
      { title: 'Canady\'s Heating & Air Savannah', url: 'https://canadys.com', city: 'Savannah, GA' },
    ],
    // ── NEW HIGH-INCOME SUBURBAN MARKETS ──────────────────────────────
    carmel: [
      { title: 'Morehart HVAC & Cooling Carmel IN', url: 'https://www.alltemperatureservices.com', city: 'Carmel, IN' },
      { title: 'Summers Plumbing Heating & Cooling Carmel', url: 'https://www.summersphc.com', city: 'Carmel, IN' },
      { title: 'Godby Heating Plumbing Electrical Carmel', url: 'https://www.godbyhpe.com', city: 'Carmel, IN' },
      { title: 'Service Plus Heating Cooling Plumbing Carmel', url: 'https://www.serviceplusheating.com', city: 'Carmel, IN' },
    ],
    zionsville: [
      { title: 'Summers PHC Zionsville IN', url: 'https://www.summersphc.com', city: 'Zionsville, IN' },
      { title: 'Godby HPE Zionsville IN', url: 'https://www.godbyhpe.com', city: 'Zionsville, IN' },
      { title: 'ARS Rescue Rooter Indianapolis', url: 'https://www.ars.com', city: 'Zionsville, IN' },
    ],
    dublin: [
      { title: 'Columbus Worthington Air Dublin OH', url: 'https://www.worthingtonair.com', city: 'Dublin, OH' },
      { title: 'Apex Plumbing Heating Air Dublin OH', url: 'https://www.apexohio.com', city: 'Dublin, OH' },
      { title: 'Buckeye Heating Cooling Plumbing Dublin', url: 'https://www.buckeyeheatingcooling.com', city: 'Dublin, OH' },
      { title: 'Five Star Home Services Dublin OH', url: 'https://www.fivestarohio.com', city: 'Dublin, OH' },
    ],
    prosper: [
      { title: 'Service Experts Heating & Air Prosper TX', url: 'https://www.serviceexperts.com', city: 'Prosper, TX' },
      { title: 'AirOne Heating & Air Conditioning Prosper', url: 'https://www.air1hvac.com', city: 'Prosper, TX' },
      { title: 'Frisco HVAC & Air Conditioning Prosper TX', url: 'https://www.friscoac.com', city: 'Prosper, TX' },
      { title: 'Milestone Electric AC Plumbing Prosper TX', url: 'https://www.milestoneplumbing.com', city: 'Prosper, TX' },
    ],
    celina: [
      { title: 'Service Experts HVAC Celina TX', url: 'https://www.serviceexperts.com', city: 'Celina, TX' },
      { title: 'Milestone Electric AC & Plumbing Celina', url: 'https://www.milestoneplumbing.com', city: 'Celina, TX' },
      { title: 'TDT Plumbing Celina TX', url: 'https://www.tdtplumbing.com', city: 'Celina, TX' },
    ],
    fulshear: [
      { title: 'Abacus Plumbing Air Conditioning Fulshear TX', url: 'https://www.abacusplumbing.net', city: 'Fulshear, TX' },
      { title: 'CoolPro AC & Heating Fulshear TX', url: 'https://www.coolproac.com', city: 'Fulshear, TX' },
      { title: 'Clements Plumbing Fulshear TX', url: 'https://www.clementsplumbing.com', city: 'Fulshear, TX' },
      { title: 'Rescue Air & Plumbing Fulshear', url: 'https://www.rescueairandplumbing.com', city: 'Fulshear, TX' },
    ],
    brentwood: [
      { title: 'Lee Company 24/7 HVAC Brentwood TN', url: 'https://leecompany.com', city: 'Brentwood, TN' },
      { title: 'Hiller Plumbing Heating & Air Brentwood', url: 'https://happyhiller.com', city: 'Brentwood, TN' },
      { title: 'Covenant Heating & Cooling Brentwood TN', url: 'https://www.covenantheatingandcooling.com', city: 'Brentwood, TN' },
      { title: 'ARS Rescue Rooter Nashville Brentwood', url: 'https://www.ars.com', city: 'Brentwood, TN' },
    ],
  },
};

/**
 * Query search engines (DuckDuckGo HTML -> DuckDuckGo Lite -> Curated Fallbacks)
 */
export async function searchLocalBusinesses({ query, city = 'Los Angeles, CA', niche = 'hvac', limit = 5 }) {
  const defaultQuery = NICHE_QUERIES[niche]?.[0] || 'Emergency HVAC Repair';
  const fullQuery = `${query || defaultQuery} ${city}`.trim();
  console.log(`[LeadHunter] Searching local businesses: "${fullQuery}" (Limit: ${limit})...`);

  const rawResults = [];

  // Strategy 1: Standard DuckDuckGo HTML
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(fullQuery)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(searchUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    clearTimeout(timer);
    if (res.ok) {
      const html = await res.text();
      const $ = cheerio.load(html);

      $('.result').each((i, el) => {
        if (rawResults.length >= limit * 2) return;

        const title = $(el).find('.result__title a').text().trim();
        let rawHref = $(el).find('.result__title a').attr('href') || '';
        const snippet = $(el).find('.result__snippet').text().trim();

        if (rawHref.includes('uddg=')) {
          try {
            const match = rawHref.match(/uddg=([^&]+)/);
            if (match) rawHref = decodeURIComponent(match[1]);
          } catch (e) {}
        }

        if (!rawHref.startsWith('http')) return;

        const isDirectory = /(yelp\.com|groupon\.com|healthgrades\.com|yellowpages\.com|angi\.com|mapquest\.com|bbb\.org|facebook\.com|instagram\.com|tripadvisor\.com|expertise\.com|thumbtack\.com|indeed\.com|duckduckgo\.com)/i.test(rawHref);
        if (isDirectory) return;

        const normalized = normalizeUrl(rawHref);
        if (!normalized) return;

        if (!rawResults.some((r) => r.url === normalized)) {
          rawResults.push({ title, url: normalized, snippet, city, niche });
        }
      });
    }
  } catch (err) {
    console.warn('[LeadHunter] DDG standard search warning:', err.message);
  }

  // Strategy 2: DuckDuckGo Lite Fallback if standard HTML was blocked
  if (rawResults.length === 0) {
    console.log('[LeadHunter] DDG standard returned 0. Trying DuckDuckGo Lite fallback...');
    try {
      const controllerLite = new AbortController();
      const timerLite = setTimeout(() => controllerLite.abort(), 3500);
      const liteRes = await fetch('https://lite.duckduckgo.com/lite/', {
        signal: controllerLite.signal,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
          Accept: 'text/html',
        },
        body: `q=${encodeURIComponent(fullQuery)}`,
      });
      clearTimeout(timerLite);

      if (liteRes.ok) {
        const liteHtml = await liteRes.text();
        const $lite = cheerio.load(liteHtml);

        $lite('.result-link').each((i, el) => {
          if (rawResults.length >= limit * 2) return;
          let href = $lite(el).attr('href') || '';
          const title = $lite(el).text().trim();

          if (href.includes('uddg=')) {
            const m = href.match(/uddg=([^&]+)/);
            if (m) href = decodeURIComponent(m[1]);
          }

          if (!href.startsWith('http')) return;

          const isDir = /(yelp\.com|groupon\.com|healthgrades\.com|yellowpages\.com|angi\.com|mapquest\.com|bbb\.org|facebook\.com|instagram\.com|tripadvisor\.com|expertise\.com|thumbtack\.com|indeed\.com|duckduckgo\.com|bing\.com)/i.test(href);
          if (isDir) return;

          const norm = normalizeUrl(href);
          if (norm && !rawResults.some((r) => r.url === norm)) {
            rawResults.push({ title, url: norm, snippet: title, city, niche });
          }
        });
      }
    } catch (err) {
      console.warn('[LeadHunter] DDG Lite warning:', err.message);
    }
  }

  // Strategy 3: Curated Geographic High-Ticket Targets (Used if search engine blocks cloud IP or to guarantee batch size up to 20)
  if (rawResults.length < limit) {
    console.log(`[LeadHunter] Pooling regional targets to fulfill batch requirement of ${limit} leads...`);
    let cityKey = (city.toLowerCase().split(',')[0] || '').trim();
    if (cityKey === 'nyc' || cityKey === 'manhattan') cityKey = 'new york';
    if (cityKey === 'la') cityKey = 'los angeles';
    if (cityKey === 'dfw' || cityKey === 'fort worth') cityKey = 'dallas';
    if (cityKey === 'scottsdale') cityKey = 'phoenix';
    if (cityKey === 'sf' || cityKey === 'bay area') cityKey = 'san francisco';
    if (cityKey === 'philly') cityKey = 'philadelphia';
    if (cityKey === 'dc' || cityKey === 'washington') cityKey = 'washington dc';
    if (cityKey === 'vegas') cityKey = 'las vegas';
    if (cityKey === 'carmel' || cityKey === 'carmel & zionsville') cityKey = 'carmel';
    if (cityKey === 'zionsville') cityKey = 'zionsville';
    if (cityKey === 'dublin') cityKey = 'dublin';
    if (cityKey === 'prosper' || cityKey === 'prosper & celina') cityKey = 'prosper';
    if (cityKey === 'celina') cityKey = 'celina';
    if (cityKey === 'fulshear') cityKey = 'fulshear';
    if (cityKey === 'brentwood') cityKey = 'brentwood';

    const targetsDict = CURATED_TARGETS[niche] || CURATED_TARGETS['hvac'] || {};
    const primaryList = targetsDict[cityKey] || CURATED_TARGETS['hvac']?.[cityKey] || [];
    const pool = [...primaryList];

    // If limit exceeds the targets of the primary city, pool sister cities from the same niche
    if (pool.length < limit) {
      const allKeys = Object.keys(targetsDict);
      for (const k of allKeys) {
        if (pool.length >= limit) break;
        if (k === cityKey) continue;
        const extra = targetsDict[k] || [];
        for (const item of extra) {
          if (!pool.some((p) => p.url === item.url)) {
            pool.push(item);
            if (pool.length >= limit) break;
          }
        }
      }
    }

    for (const c of pool) {
      if (rawResults.length >= limit) break;
      const norm = normalizeUrl(c.url);
      if (norm && !rawResults.some((r) => r.url === norm)) {
        rawResults.push({
          title: c.title,
          url: norm,
          snippet: `${c.title} - High-Ticket Service Center in ${c.city}`,
          city: c.city,
          niche,
        });
      }
    }
  }

  console.log(`[LeadHunter] Found ${rawResults.length} prospective domains.`);
  return rawResults.slice(0, limit);
}

/**
 * Enrich a raw scraped lead with decision-maker name, direct email, phone, and run digital audit
 */
export async function huntAndEnrichLead({ url, city, niche = 'hvac', doctorOverride, treatmentOverride, businessNameOverride, fast = false }) {
  console.log(`[LeadHunter] Enriching & Auditing: ${url} (${niche})...`);

  // 1. Scrape domain for decision maker, emails, phones, and ad tracking pixels
  let scraped = await scrapeClinicWebsite(url, { fast, niche });

  // Graceful fallback for domains protected by Cloudflare/firewall so high-ticket leads are never dropped
  if (!scraped || !scraped.success) {
    let fallbackName = businessNameOverride;
    if (!fallbackName) {
      try {
        const hostname = new URL(url).hostname.replace(/^www\./, '');
        fallbackName = hostname.split('.')[0].replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      } catch (e) {
        fallbackName = 'Local Service Center';
      }
    }
    // Clean up title noise
    fallbackName = fallbackName.split(/[-|•–]/)[0].trim();

    const isTradeSite = niche !== 'medspa';
    const fallbackTitle = isTradeSite ? `Owner / Operations Lead at ${fallbackName}` : `Medical Director at ${fallbackName}`;
    const fallbackTreatment = isTradeSite ? 'Emergency AC & Heating Repair' : 'Morpheus8 & Injectables';
    let fallbackEmail = '';
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, '');
      fallbackEmail = `info@${hostname}`;
    } catch (e) {}

    scraped = {
      success: true,
      url,
      clinicName: fallbackName,
      doctorName: doctorOverride || fallbackTitle,
      email: fallbackEmail,
      allEmails: fallbackEmail ? [fallbackEmail] : [],
      phone: null,
      city: city || 'US',
      treatment: treatmentOverride || fallbackTreatment,
      allTreatments: [fallbackTreatment],
      adSignals: { hasPaidAds: false, metaPixel: false, googleAds: false, tikTokPixel: false, source: 'fallback_unverified' },
      rawHtml: null,
    };
  }

  // 2. Decision Maker fallback extraction
  let decisionMaker = doctorOverride || scraped.doctorName;
  const isTradeSite = niche !== 'medspa';
  if (!decisionMaker || decisionMaker === 'Doctor' || (isTradeSite && (decisionMaker.includes('Medical Director') || decisionMaker.includes('Doctor')))) {
    if (isTradeSite) {
      decisionMaker = `Owner / Operations Lead at ${scraped.clinicName || 'Company'}`;
    } else {
      decisionMaker = `Medical Director at ${scraped.clinicName || 'Clinic'}`;
    }
  }

  // 3. Run The Auditor (Speed-to-lead & Friction Diagnostics)
  const audit = await runDigitalAudit({
    url,
    niche,
    businessName: scraped.clinicName,
    doctorName: decisionMaker,
    htmlContent: scraped.rawHtml,
  });

  let primaryTreatment = treatmentOverride || audit.primaryService || scraped.treatment;
  const TRADE_VALID_SERVICES = [
    'Emergency AC Repair', 'HVAC Replacement', 'Heat Pump Repair', 'Furnace Maintenance',
    'Ductless Mini-Split', 'Commercial Refrigeration', 'Emergency Plumbing', 'Emergency AC & Heating Repair',
    'Air Conditioning Repair Replacement', 'Water Heater Replacement', 'Drain Cleaning', 'Emergency Roof Repair',
    'Roof Replacement', 'Emergency Electrician', 'Panel Upgrade', 'Water Damage Restoration', 'Emergency Service Calls'
  ];
  if (isTradeSite) {
    const isValid = TRADE_VALID_SERVICES.some(t => primaryTreatment && primaryTreatment.toLowerCase().includes(t.toLowerCase()));
    if (!primaryTreatment || !isValid) {
      primaryTreatment = niche === 'plumbing'
        ? 'Emergency Plumbing & Water Heater Repair'
        : niche === 'roofing'
        ? 'Emergency Roof Repair & Replacement'
        : niche === 'electrical'
        ? '24/7 Emergency Electrical Service'
        : niche === 'water_damage'
        ? 'Emergency Water Damage Restoration'
        : 'Emergency AC & Heating Repair';
    }
  }

  // 4. Construct direct email or fallback domain email so clinics with verified phones are never discarded
  let finalEmail = scraped.email;
  if (!finalEmail && scraped.url) {
    try {
      const hostname = new URL(scraped.url).hostname.replace(/^www\./, '');
      finalEmail = `info@${hostname}`;
    } catch (e) {}
  }

  return {
    success: true,
    url: scraped.url,
    clinicName: scraped.clinicName,
    doctorName: decisionMaker,
    salutation: scraped.salutation || null,
    email: finalEmail,
    allEmails: scraped.allEmails,
    phone: scraped.phone,
    city: city || scraped.city,
    treatment: primaryTreatment,
    niche,
    adSignals: scraped.adSignals,
    multiLocation: scraped.multiLocation || { isMultiLocation: false, reason: 'Single practice' },
    socialSignals: scraped.socialSignals || { hasGmb: false, hasInstagram: false, hasFacebook: false, summary: 'Organic Direct' },
    specificObservation: audit.specificObservation,
    recommendedAngle: audit.recommendedAngle,
    hasStaticForm: audit.hasStaticForm,
  };
}

/**
 * Deduplicate against Supabase and save enriched lead as RAW_LEAD (pending) in 1 round-trip
 */
export async function commitLeadToSupabase(enrichedLead, existingProspectsMap) {
  if (!enrichedLead || !enrichedLead.email) {
    return {
      success: false,
      message: 'Cannot commit to Supabase: No direct email found.',
      lead: enrichedLead,
    };
  }

  const normalizedEmail = enrichedLead.email.toLowerCase().trim();

  // Deduplication check: in-memory map or query
  const existing = existingProspectsMap ? existingProspectsMap.get(normalizedEmail) : await getProspectById(normalizedEmail);
  if (existing) {
    // If it exists, update specific_observation and recommended_angle if missing
    if (!existing.specific_observation && enrichedLead.specificObservation) {
      await updateProspect(existing.id, {
        specific_observation: enrichedLead.specificObservation,
        recommended_angle: enrichedLead.recommendedAngle,
        website_url: enrichedLead.url,
        phone: enrichedLead.phone,
        niche: enrichedLead.niche,
      });
    }

    return {
      success: false,
      alreadyExists: true,
      message: `Prospect ${normalizedEmail} already exists in Supabase.`,
      prospect: existing,
    };
  }

  // Insert into Supabase public.prospects in 1 single round-trip
  const chainTag = enrichedLead.multiLocation?.isMultiLocation ? 'CHAIN' : 'Single-Location';
  const gmbTag = enrichedLead.socialSignals?.hasGmb ? 'GMB:✓' : 'GMB:○';
  const igTag = enrichedLead.socialSignals?.hasInstagram ? 'IG:✓' : 'IG:○';
  const notes = `Hunter: ${chainTag} | ${gmbTag} | ${igTag} | Ads: ${enrichedLead.adSignals?.hasPaidAds ? 'ACTIVE' : 'Organic'} | Phone: ${enrichedLead.phone || 'N/A'}`;

  const addResult = await addProspect({
    doctorName: enrichedLead.doctorName,
    clinicName: enrichedLead.clinicName,
    email: normalizedEmail,
    city: enrichedLead.city,
    treatment: enrichedLead.treatment,
    notes,
    phone: enrichedLead.phone,
    specific_observation: enrichedLead.specificObservation,
    recommended_angle: enrichedLead.recommendedAngle,
    website_url: enrichedLead.url,
    niche: enrichedLead.niche || 'medspa',
  });

  if (!addResult.success) {
    return { success: false, error: addResult.error || 'Failed to insert lead' };
  }

  if (existingProspectsMap) {
    existingProspectsMap.set(normalizedEmail, addResult.prospect);
  }

  return {
    success: true,
    prospect: addResult.prospect,
  };
}

/**
 * Full Autonomous Lead Hunter Execution: Search -> Enrich -> Audit -> Deduplicate -> Commit
 */
export async function runAutonomousHunt({ city = 'Los Angeles, CA', niche = 'hvac', query, limit = 5 }) {
  const targetLimit = Math.min(Math.max(Number(limit) || 5, 1), 40);
  console.log(`[LeadHunter] Starting Autonomous Hunt for ${niche} in ${city} (Target: ${targetLimit})...`);

  // Step 1: Search with candidate buffer (targetLimit * 2) so domain timeouts don't starve batch size
  const candidateTarget = Math.min(Math.max(targetLimit * 2, targetLimit + 4), 60);
  const businesses = await searchLocalBusinesses({ query, city, niche, limit: candidateTarget });
  if (!businesses || businesses.length === 0) {
    return {
      success: false,
      message: `No eligible non-directory domains found for ${city} query.`,
      city,
      niche,
      leads: [],
    };
  }

  // Pre-load all existing prospect emails in 1 single Supabase call (50ms) to eliminate N+1 latency
  let existingEmailMap = null;
  try {
    const allExisting = await getProspects({ limit: 1000 });
    existingEmailMap = new Map();
    for (const p of allExisting) {
      if (p.email) existingEmailMap.set(p.email.toLowerCase().trim(), p);
    }
  } catch (e) {
    console.warn('[LeadHunter] Pre-load map warning:', e.message);
  }

  // Step 2 & 3: Concurrently Enrich, Audit & Commit in parallel
  // Fast mode + in-memory HTML parsing + 1-trip inserts ensure all leads qualify rapidly
  const enrichmentPromises = businesses.map(async (item) => {
    try {
      const enriched = await Promise.race([
        huntAndEnrichLead({
          url: item.url,
          city: item.city,
          niche: item.niche,
          businessNameOverride: item.title,
          fast: true,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Domain timeout (8s)')), 8000)),
      ]);

      if (enriched && enriched.success) {
        // Commit with single-trip deduplication
        const commitRes = await commitLeadToSupabase(enriched, existingEmailMap);
        enriched.savedToDb = commitRes.success;
        enriched.dbStatus = commitRes.alreadyExists ? 'duplicate' : commitRes.success ? 'saved' : 'no_email';
        return { success: true, lead: enriched, committed: commitRes.success };
      }
    } catch (err) {
      console.warn(`[LeadHunter] Failed to process ${item.url}:`, err.message);
    }
    return { success: false, url: item.url };
  });

  const settled = await Promise.allSettled(enrichmentPromises);
  const enrichedLeads = [];
  let committedCount = 0;

  for (const res of settled) {
    if (res.status === 'fulfilled' && res.value?.success && res.value.lead) {
      enrichedLeads.push(res.value.lead);
      if (res.value.committed) committedCount++;
      if (enrichedLeads.length >= targetLimit) break;
    }
  }

  return {
    success: true,
    city,
    niche,
    totalSearched: businesses.length,
    committedCount,
    leads: enrichedLeads,
  };
}
