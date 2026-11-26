// elevate-narrative.mjs
// Rewrites mission map texts to remove arcade tropes and elevate character voices and boss barks.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { existsSync } from 'node:fs';

const missionsDir = existsSync('game/src/missions') ? 'game/src/missions' : 'src/missions';
const files = readdirSync(missionsDir).filter((f) => f.endsWith('.map.json'));

const ELEVATIONS = {
  'ashen-tier.map.json': {
    body: 'Three stepped basalt terraces ascend toward the soot-choked Ashen Plateau. Force the central ascent, purge the flanking picket redoubts under heavy arrow fire, and shatter the Ashen Colossus guarding the caldera verge.',
    'msg.3': 'All three highland passes are secured. Sifted from the shattered barricades at the central ramp is the paymaster\'s iron-banded coffer, yielding eight hundred minted silver sovereigns.',
    'npc.pathfinder': 'The mid-terrace sanctuary still preserves ancient elemental wardings, while Eastpass Outpost hammers out hardened highland plate. Mend your armor before ascending to the ash.',
  },
  'blackwater-reach.map.json': {
    body: 'Raider warbands have seized the river crossings along the Blackwater, severing the supply lines between Millwatch and the western garrisons. Sunder the bridge toll-barricades, clear the salt-marsh causeway, and bring down the stone guardian on the eastern headland.',
    'msg.3': 'The Southern Causeway is cleared of hostiles. Secured beneath the collapsed tollhouse lies an iron courier lockbox yielding six hundred silver florins.',
    'msg.4': 'The stone guardian collapses in a deafening thunder of granite and mortar. Cracked open within its pedestal rests an eight-hundred-coin imperial bullion hoard.',
    'npc.ferryman': 'The Blackwater runs thick and black with mountain soot. Cross by the northern timber spans or wade the gravel shallows; the southern marsh will drown a man in full plate before he takes ten paces.',
    'npc.scout': 'Our smith\'s forge still burns hot despite the siege. Re-temper your notched edges here before forcing the eastern bluffs.',
  },
  'blood-at-the-ford.map.json': {
    body: 'Cold river rapids churn with soot and butchered border sentries as Chieftain Grok\'tar\'s highland gnolls overrun the Sunken Ford. You ride as the realm\'s Lone Wolf commander into an abandoned frontier. Scour the willow thickets, reclaim the plundered garrison supply wagons, and storm Grok\'tar\'s palisade redoubt before the frontier collapses into ruin.',
    'obj.4': 'Recover the Plundered Garrison Supply Wagons',
    'msg.1': 'Warden Hale clenches his gauntleted fist against the rain: "You march alone, Commander. The border garrison broke at twilight when the river went black with blood. Tread the silt carefully—the willows conceal wolf-packs and barbed archers on the high bluffs. Strike down Grok\'tar before his war-host encircles the entire valley."',
    'msg.2': 'Throaty, bloodthirsty war-howls rip through the reed beds! Gnoll ambushers breach the shallows, brandishing notched cleavers and barbed horn-bows!',
    'msg.3': 'The Sunken Ford is held. The current foams red against the silt. Grok\'tar\'s palisade war-camp crowns the High Bluff Ridge to the north-east—storm the bluffs!',
    'msg.4': 'Chieftain Grok\'tar collapses amidst the splintered timbers of his command post, his torso cleaved through. The surviving gnoll packs break in terror into the mountain fens. Thornwick\'s northern frontier holds!',
    'msg.6': 'Chieftain Grok\'tar bares yellowed fangs, his throat heaving with choked fury: "Your imperial axes cleared our hunting forests! Your iron mines poisoned our mountain springs! We did not cross the river for plunder, invaders—we crossed because our whelps were starving in the ash! Now you bring your cold steel to the shallows? I will break your spine upon these river stones!"',
    'msg.7': 'Prying up the charred timbers of the ruined granary floor, you recover salt-cured rations and an iron requisition coffer holding three hundred frontier crowns.',
    'msg.7.who': 'Plundered Granary Coffer',
  },
  'bracken-glade.map.json': {
    body: 'A cyclopean stone brute prowls the pine line south of Bracken Inn, while hungry raider packs scour the trade ruts. Enlist mercenary archers at the hearth, sharpen your steel at the forge, and lure the lumbering monstrosity into a coordinated crossfire.',
    'msg.3': 'The timber brute crashes into the pine needles, its ribcage shattering to reveal an iron courier pouch stuffed with reclaimed currency and honed vanguard blades.',
    'npc.ranger': 'Keep your cohorts behind the pine line. The timber brute has the reach of a siege ram, but its gait is sluggish through the roots. Loose your barbed shafts over the bracken before it closes the gap.',
  },
  'cinder-throne.map.json': {
    body: 'At the burning core of the Ashen Deep looms the Cinder Throne. Ashkarath, the Primeval Cinder Sovereign, commands the abyssal magma flows. Sunder his dominion to conclude this apocalyptic campaign.',
    'msg.1': 'Aldren grips his hilt with bleeding fingers: "Ashkarath is not a beast, Commander—he is the living cinder of the First Cataclysm. His breath liquefies armor plate; he cages men in calcified ribcages while celestial lightning arcs from his horns. Do not hesitate. If your strike falters, we burn together."',
  },
  'crossroads-of-ash.map.json': {
    body: 'Warbands patrol the charred highways converging on the Crossroads of Ash, cutting off Basalt Camp to the south. Eliminate both patrol wings and topple the Ash-Crowned Colossus guarding the north-east bastion.',
    'msg.3': 'The Eastern Road is cleared of pickets; behind their scorched baggage cart rests a reinforced campaign strongbox holding seven hundred and fifty silver pieces.',
    'msg.4': 'The Ash-Crowned Colossus topples into incandescent slag. Sifted from the cooled basalt slag is the sundered tribute coffer of nine hundred ancient coins.',
    'npc.courier': 'Basalt Encampment lies directly south down the paved highway. Mind the road shoulders—the raiders grease the basalt pavers to pitch heavy cavalry into the ravines.',
    'npc.quarter': 'Stock up on tempered highland steel before pushing toward the north-east bastion. Once you engage the Colossus, there is no retreating down the gorge.',
  },
  'drowned-choir.map.json': {
    body: 'Within the submerged black basalt catacombs beneath Varmouth echoes the Drowned Choir. Vesperion, the Hollow Choir, commands the residual astral resonance of the drowned elders. Slay Vesperion to sever the necrotic tether.',
    'msg.1': 'Quillon\'s voice trembles over the roar of the surf: "The tides themselves obey Vesperion\'s agony. He channels the unquiet dead into arcing lances of ozone and siphons the warm blood from living veins into the cold brine. Seal your mind against his chorus—or you will march into the waves willingly."',
  },
  'gullet-of-dunes.map.json': {
    body: 'Deep within the sand-choked subterranean crypts yawns the Gullet of Dunes. Gorrathul, the Sand Glutton, reigns over this suffocating pit with unyielding cold. Slay the subterranean horror to break the desert plague.',
    'msg.1': 'Sabik spits bitter sand, eyes fixed on the vibrating dunes: "Feel that under your boots? The bedrock is shivering. Gorrathul does not hunt with eyes—he hears your heartbeat through thirty cubits of compressed quartz. When the frost-mist rolls across the dunes, brace your halberds; he breaches from below to swallow whole ranks."',
  },
  'inward-march.map.json': {
    body: 'Concentric cordons of dressed granite and deep moats shield the central keep. Sweep the outer picket camps, withstand the garrison\'s desperate sally, and topple the Iron Ring Warden.',
    'msg.2': 'The outer picket camps are shattered! Recovered near the northern portcullis lies a garrison payroll strongbox holding five hundred silver florins.',
    'npc.watchman': 'The academy at Outer Bastion still instructs acolytes in defensive wards and restorative prayers. If you seek heavier blades, flank eastward toward the sally post.',
  },
  'kids-paradise-opening.map.json': {
    body: 'Follow the packed wagon trail into the forest clearing. The armory storehouse stands west of the timber inn. When your provisions are packed and your weapons belted, take the northeastern track past the reed pond.',
  },
  'm05-lantern-passage.map.json': {
    'msg.4': 'The Ravine Warden shatters upon the rock floor, leaving a reinforced lockbox of coins pried from fallen frontier messengers.',
  },
  'm06-greywood-supply.map.json': {
    'obj.0': 'Sunder the Three Raider Supply Redoubts in Greywood',
    'msg.2': 'The western storehouse smolders to ash; pried from its cellar is the raiders\' plundered quartermaster coffer.',
  },
  'm07-split-vanguard.map.json': {
    body: 'A sheer granite fang cleaves the highland highway into twin narrow defiles. Advance your cohorts along both passes to break the stone sentinels and kindle the Northern and Southern Signal Cairns.',
  },
  'm08-alder-bridge.map.json': {
    body: 'Raider columns mass on the eastern embankment of the Alder River. Anchor the western bridgehead against three waves of assault and prevent any vanguard infiltration onto the supply road.',
  },
  'm09-ironhide-hunt.map.json': {
    'msg.4': 'Krag Ironhide collapses with a sickening rupture of calcified armor, relinquishing the plundered bullion and heirloom talismans he ripped from fallen border patrols.',
  },
  'm10-undervault-links.map.json': {
    body: 'Beneath the canyon ridge run three torchlit granite galleries linking Ashbrook to the outer passes. Purge the cultists and stone sentinels guarding the vaults to reopen the subterranean thoroughfare.',
  },
  'm11-ashbrook-retreat.map.json': {
    'msg.5': 'Siege Commander Velen is cut down amidst the smoke of his command tent. His field desk splits open under our blades, yielding the siege war-ledger and the six hundred gold sovereigns meant to pay his vanguard.',
  },
  'm12-redmarsh-border-128.map.json': {
    'obj.1': 'Sunder the Three Raider Reconnaissance Wings',
    'msg.3': 'All three raider reconnaissance wings are broken in the mire. Abandoned beneath the shattered toll gate lies an iron courier coffer of recovered coins.',
  },
  'm13-twin-passes-128.map.json': {
    body: 'Two razor-sharp canyon passes bottleneck the road into the salt desert. Secure both defiles and destroy the basalt barricades before the desert raiders reinforce the heights.',
  },
  'm14-scattered-scouts-128.map.json': {
    body: 'Scattered frontier outriders are pinned across the salt scrub. Relieve the isolated patrols, establish defensive perimeter lines, and push through the raider cordons.',
  },
  'm15-outpost-palisade-128.map.json': {
    body: 'An isolated timber stockade holds the border bluff against howling raider packs. Rally the defenders, repulse the assault waves, and burn the enemy siege timber.',
  },
  'm16-wardstone-rupture-128.map.json': {
    body: 'A primeval elemental wardstone has cracked open, spewing wild astral discharge across the canyon floor. Eliminate the cultist cabal attempting to harness the rift and restore order.',
  },
  'm17-mire-convoy-128.map.json': {
    'msg.3': 'The ridge blockade is shattered; pry loose the iron-reinforced payroll coffer abandoned in their baggage train.',
  },
  'm18-granary-raid-128.map.json': {
    body: 'Raider raiders have seized the frontier grain storehouses, threatening the garrison with starvation. Storm the depot, neutralize the guards, and reclaim the grain reserves intact.',
  },
  'm19-hexer-capture-128.map.json': {
    body: 'A rogue blood-hexer conducts foul rites deep within Hexer\'s Hollow. Breach the cavern sanctuary, cut down her bone guardians, and bring an end to her maledictions.',
  },
  'm20-deep-quarry-128.map.json': {
    'obj.1': 'Neutralize the Pit-Floor Garrison and Sunder the Quarry Watch',
  },
  'm21-lean-garrison-128.map.json': {
    'msg.1': 'Hold the north lane! Lock your shields and do not let their shock troops breach the courtyard behind our archers!',
  },
  'm22-fleeing-column-128.map.json': {
    body: 'A fleeing column of imperial deserters carries sensitive tactical ciphers across the border. Intercept the deserters before they reach sanctuary in the badlands.',
  },
  'm23-fork-of-spears-128.map.json': {
    body: 'The Fork of Spears marks the gateway into the Sunless Deeps. Break through the entrenched enemy spearheads holding the crossroads and force the passage into the subterranean abyss.',
  },
  'm24-pledge-at-oakhaven-192.map.json': {
    'msg.3': 'The eastern ridge redoubt is breached; our spearmen secure their plundered garrison lockbox holding five hundred silver coins!',
    'npc.bailiff': 'Take whatever forged iron you need from our armorer and enlist fresh mercenary blades at the tavern before forcing the canyon gap.',
  },
  'm25-cinder-wards-192.map.json': {
    'msg.2': 'The Western Ward collapses into dead cinder, exposing the ancient offertory coffer of four hundred star-silver florins!',
    'msg.3': 'The Northern Ward fractures into black glass, revealing four hundred ancient crowns nestled within the ward-socket.',
    'msg.4': 'The Eastern Ward\'s runic fires extinguish, yielding four hundred uncorrupted sovereigns from the altar vault.',
  },
  'm26-sundered-ranks-192.map.json': {
    'msg.2': 'The Western flank encampment breaks in disarray; our vanguard secures the battalion payroll coffer of five hundred crowns!',
    'msg.3': 'The Eastern flank scatters into the scrub; recovered from their baggage line is five hundred coins in plundered bullion!',
  },
  'm27-field-infirmary-192.map.json': {
    body: 'Wounded veterans huddle in a vulnerable field infirmary as enemy raiders encircle the glade. Establish a protective shield wall, evacuate the wounded, and crush the attackers.',
  },
  'm28-sunken-citadel-192.map.json': {
    'msg.2': 'The outer gate garrison breaks before our push; battered open in the breach is the siege payroll of eight hundred gold florins!',
    'npc.sapper': 'Keep mages and archers clear of the marsh moat outside the wall; greaves and chainmail will pull a man down into the peat in seconds.',
  },
  'm29-hourglass-rescue-192.map.json': {
    body: 'Prisoners of war are held in a flooded dungeon as the water level rises relentlessly. Race against time to breach the cell blocks and extricate the survivors.',
  },
  'm30-starved-bastion-192.map.json': {
    'msg.2': 'Both enemy supply columns lie butchered in the valley; our scouts recover the grain wagons and an iron ration coffer holding six hundred coins.',
  },
  'm31-riverlock-crossing-192.map.json': {
    'msg.2': 'The West Riverlock is secured; an ironbound toll vault holding four hundred and fifty silver coins is pried from the masonry.',
    'msg.3': 'The East Riverlock falls; our halberdiers breach the lockmaster\'s strongbox, securing four hundred and fifty crowns.',
  },
  'm32-elder-juggernaut-192.map.json': {
    'msg.3': 'The Elder Juggernaut groans and fractures into dormant granite, unsealing the primeval treasury of one thousand ancient runic coins embedded in its core!',
  },
  'm33-high-stakes-gambit-192.map.json': {
    body: 'Two heavily fortified reliquary crypts flank the central bastion. Drive straight through the vanguard to strike down the Vault Keep Commander, or risk assaulting the flanking crypts to recover ancient battle relics and imperial bullion.',
    'msg.1': 'Will you divert cohorts to breach the golem-guarded reliquary vaults, or force a bloody spearhead directly into the central keep?',
    'msg.2': 'The West Reliquary crypt is unsealed—one thousand ancient sovereigns and an Elixir of Mind are reclaimed from the dust!',
    'msg.3': 'The East Reliquary crypt is broken open, yielding one thousand ancient coins and an ancestral Knight\'s Broadsword!',
  },
  'm34-clashing-banners-192.map.json': {
    'msg.3': 'The Ironclad Banner is torn down in blood; our scouts recover their vanguard strongbox of seven hundred florins!',
    'msg.4': 'The Ashen Banner shatters in retreat; seized from their burning supply tent is seven hundred gold sovereigns!',
  },
  'm35-burning-harbor-192.map.json': {
    'msg.3': 'The evacuation pier is held against all odds! The refugee ships cast off into the mist, and the harbor master entrusts us with the garrison\'s reserve treasury of one thousand gold.',
    'npc.orson': 'The sanctuary school at Harborwatch still preserves master-level wards and healing incantations. Inscribe what scrolls you need before forcing the burning plaza.',
  },
  'm36-heartland-march-256.map.json': {
    'msg.2': 'The forward scout screen is shattered; abandoned along the forest trail is a plundered border coffer containing four hundred silver pieces.',
    'npc.elda': 'Highcrest maintains tier-five armaments and instructs in master wardcraft. Hire fresh mercenary steel before ascending the pass.',
  },
  'm37-shattered-beacons-256.map.json': {
    body: 'Three towering signal beacons hold the valley in an interlocking runic grid. Sunder all three beacon garrisons to collapse the magical warding and clear the mountain approach.',
  },
  'm38-besieged-wall-256.map.json': {
    'obj.0': 'Hold the Bastion Wall and Repel the Three Siege Cohorts',
  },
  'm39-flight-of-malrik-256.map.json': {
    'msg.4': 'Malrik collapses upon the bloody flagstones; from his dying grip we pry the royal cipher-keys and the conspirators\' ledger.',
  },
  'm40-twofold-assault-256.map.json': {
    body: 'Twin fortresses flank the abyss, commanding the approaches to the Iron Citadel. Split your cohorts or strike with crushing speed—both bastions must be razed.',
  },
  'm41-gauntlet-of-iron-256.map.json': {
    'msg.2': 'The First Gate is splintered by our vanguard! Sifted from the garrison guardpost is a strongbox containing three hundred and fifty silver crowns.',
  },
  'm42-outer-rampart-256.map.json': {
    body: 'The cyclopean Outer Rampart bars entry to the final fortress. Breach at least two of its three fortified gatehouses to force the Inner Bailey open, then put its garrison to the sword.',
  },
  'm43-three-roads-siege-256.map.json': {
    body: 'Enemy siege columns converge upon Three-Roads Watch from the north, west, and east. Hold the central redoubt alongside Warden Tessa\'s guard, then launch a counter-stroke against their staging camp.',
  },
  'm44-threshold-choice-256.map.json': {
    body: 'Beneath the sundered rampart lies the Threshold Chamber of the Crown Vault. Clear its sentinels, then step onto either the West Altar of Order or the East Altar of Ember to determine the fate of the realm.',
  },
  'm45-crown-of-order-256.map.json': {
    body: 'Final Chapter — Path of Order. Bind the West and East Anchor Seals of the Crown Vault, then defeat Arch-Warden Korrath to seal the realm\'s heart in eternal, immutable stasis.',
    'msg.1': 'Archivist Orla whispers in awe and dread: "Korrath stands as the eternal warden of imperial law, his flesh turned to petrified granite by three centuries of unbroken vigil. He draws life from the twin resonance anchors flanking the vault. Sunder those conduits first, or his blades will execute us in the name of a dead empire."',
  },
  'm46-ember-reckoning-256.map.json': {
    body: 'Final Chapter — Path of Ember. Shatter the West and East Conduit Pillars feeding the Furnace Heart, then strike down Ember Overlord Vorak to consume the vault in cleansing flame.',
    'msg.1': 'Marshal Vance watches the shimmering heat waves distort the chasm: "Vorak sees the world through the eye of a volcanic kiln. To him, our flesh is only slag, and our cities are fuel for the Great Cleansing. He channels the magma chambers through the two obsidian conduit pylons. Break those anchors, or he will turn this whole caldera into an open crematorium!"',
  },
  'muddlefen.map.json': {
    body: 'Thick, fetid peat bogs drag at every step across Muddlefen. Thread the dry gravel spits, survive the southern ambush in the reeds, and topple the Mirestone Hulk.',
    'msg.3': 'The marsh corridors are cleared of ambuscades; an abandoned contraband lockbox of four hundred and fifty coins is recovered on the causeway.',
    'npc.guide': 'The peat moss drinks blood and drags at greaves like lead. Regroup on the dry gravel islands before pressing toward Reedwatch Isle.',
  },
  'nightfall-at-ravenwatch.map.json': {
    body: 'Ravenwatch stands as a crumbling border fortress pierced by four ruined gates. Blood-crazed packs gather at twilight to assault the courtyard; by daylight they lair around bone totems in the woods. Hold the walls through the darkness, then purge their unholy totems.',
  },
  'scarlet-ridge.map.json': {
    body: 'Three fortified camps overlook the twin lakes of Scarlet Ridge. Force the narrow dry causeway under fire, secure the northern plateau, and recover the thousand-sovereign tribute hoard guarded upon the eastern ridge.',
    'msg.1': 'Raiders fortify the narrow land-bridge between the lakes, while an elite retinue guards their plundered tribute stash high upon the eastern ridge.',
    'msg.3': 'The eastern ridge guards are put to the sword; our vanguard secures their plundered hoard of one thousand gold crowns!',
    'npc.scout': 'Northreach across the water carries hardened blades; enlist swords at the inn before forcing the bridge.',
  },
  'shallow-ford.map.json': {
    body: 'Two broad gravel shallows span the rushing river while hostile archers and battle-mages fortify the bluffs. Seize both crossings, take the central redoubt, and bring down Fordbreaker Crag.',
    'msg.3': 'Both river crossings and the redoubt overlook are secured; our scouts recover an iron paymaster\'s coffer containing five hundred coins at the south ford.',
    'npc.scout': 'The north and south gravel shallows are broad enough for an eight-man shield line. Keep your visors down once you step into the rapids—the ridge bowmen have measured the distance.',
  },
  'shattered-shore.map.json': {
    body: 'Sea raiders have seized the narrow stone causeways linking the three coastal havens. Retake the southern causeway to relieve Driftwood Haven, purge the sunken wharf, and topple the Tide-Forged Warden on the northern headland.',
    'msg.3': 'The Sunken Wharf falls silent in the sea mist; dragged from beneath the rotted slipway is a smugglers\' ironbound strongbox holding nine hundred gold coins.',
    'msg.4': 'The Tide-Forged Warden collapses like a sundered cliffside, shattering its calcified ribcage to reveal the drowned galleon\'s hoard of twelve hundred ancient sovereigns!',
    'npc.harbor': 'Beacon Point on the far headland holds masterwork steel if your company can force the outer causeway.',
    'npc.pilot': 'Watch the eastern wharf—imp firebolts rake the approach and the tide is turning.',
  },
  'the-sunken-sanctum.map.json': {
    body: 'Beneath Ravenwatch lies a flooded subterranean basilica traversed by narrow granite bridges. The renegade cultist Mordred the Ashen waits in the nave with his blood-guard. He will withdraw behind reinforcements when pressed.',
    'msg.1': 'Captain Isolde signals halt, peering through the rising vapor: "Single file across the granite spans. The apostates on the high dais have line of sight—shield your flanks!"',
    'msg.2': 'Mordred screams an oath in the elder tongue, falling back into the shadowed apse as the water churns with subterranean horrors behind us!',
    'msg.3': 'Mordred the Ashen falls dead upon the submerged flagstones. The demonic chanting withers, and the sanctum falls silent once more.',
  },
  'thornwick-market.map.json': {
    body: 'Thornwick is a fortified frontier market settlement flanked by high timber palisades. Enlist mercenary blades at the tavern, accept contracts from the garrison board, purchase tempered steel at the armory, and master runic incantations at the academy.',
    'msg.1': 'Step within the palisades, Commander. The mud of the outer roads clings heavy to your boots. Before you lies Thornwick: the tavern on the left for mercenary blades and whispers, the armory shop in the center for tempered steel, and the academy on the right for runic incantations. Take these silver crowns from the garrison ledger to equip your cohort.',
    'npc.reeve': 'Raiders choke every mountain pass, and half the garrison is either shivering with marsh fever or drinking away their back pay. Take the tavern contracts on the board, Commander—Thornwick still pays in silver, even if the coins are tarnished by blood.',
    'npc.miller': 'Gnolls broke into the mill at midnight, dragging two sacks of coarse flour into the marsh. If you march eastward toward the border ford, keep your shield tilted high—their barbed horn-bows punch straight through boiled leather.',
  },
  'tidebreak-cove.map.json': {
    body: 'Three salt-encrusted outposts dot the curving sands of Tidebreak Cove. Break through the amphibious swarm patrols, recover the plundered coastal cache, and bring down the towering Stone Warden crowning the northern promontory.',
    'msg.3': 'The eastern cache is broken open—five hundred reclaimed imperial sovereigns gleam amidst the sea-silt!',
    'npc.mariner': 'Central Shore Inn and the Southeastern Harbor forge sturdy armor if your vanguard needs reinforcement before ascending the northern ridge.',
  },
  'twin-furies.map.json': {
    body: 'Twin stone fortresses crown the ridges overlooking the central valley, while an iron-forged colossus commands the warband between them. Sunder both ridge camps and shatter the central valley vanguard.',
    'msg.2': 'The Western Ridge Camp has fallen; an iron-banded requisition coffer holding eight hundred silver florins is secured in the courtyard!',
    'msg.3': 'The Eastern Ridge Camp is cleared of hostiles, uncovering an eight-hundred-coin plunder hoard beneath their command tent.',
    'msg.4': 'The Central Valley warband and their basalt guardian lie shattered into rubble, unsealing their tribute hoard of twelve hundred gold pieces!',
    'npc.smith': 'The iron ore from the eastern crags drinks fire like oil, soldier. If your cuirass is dented, push through to Ironbrook—their bellows run hot day and night.',
    'npc.ranger': 'Keep your eyes on the ravine between the ridges. The wind carries the rattle of iron rings and the reek of unwashed leather—patrols cross every quarter glass.',
  },
  'weeping-ossuary.map.json': {
    body: 'You have breached the lowest subterranean vault of the Weeping Ossuary. Morvessa, the Silk Matron, nests in the central bone-choked crypt. Purge her parasitic brood and put the abomination to the sword.',
    'msg.1': 'Orlen holds a bundle of burning rot-herbs to his nose: "The stench... sweet and rancid, like sheep tallow left in sunlit bile. Morvessa weaves her brood from the marrow of fallen legions. Her bile melts bronze and bone alike, and her chittering hatchlings seek the warmth of open wounds. Keep the torches high and shields locked."',
  },
  'whispers-in-the-fen.map.json': {
    body: 'Raiders burst from the deep fens, burning the border outposts. A surviving pathfinder knows the hidden trail to the ruined watchtower, but the mire impedes heavy cohorts and enemy archers command the dry ridge. Escort the scout to the tower alive.',
    'msg.4': 'Both breeding hollows are purged with fire. Sifted from the muck is an ancient spell scroll and a courier coffer of coins recovered from fallen messengers.',
  },
};

let updatedCount = 0;
for (const file of files) {
  const filePath = join(missionsDir, file);
  const content = readFileSync(filePath, 'utf8');
  const json = JSON.parse(content);
  let changed = false;

  const overrides = ELEVATIONS[file];
  if (overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      if (json.text[k] !== v) {
        json.text[k] = v;
        changed = true;
      }
    }
  }

  if (changed) {
    writeFileSync(filePath, JSON.stringify(json) + '\n', 'utf8');
    updatedCount++;
    console.log(`Updated ${file}`);
  }
}

console.log(`Successfully elevated narrative in ${updatedCount} missions.`);
