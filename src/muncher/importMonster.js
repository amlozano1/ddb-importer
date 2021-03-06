import utils from "../utils.js";
import logger from "../logger.js";
import DICTIONARY from "../dictionary.js";
import { copySRDIcons } from "./import.js";

/**
 * Sends a event request to Iconizer to add the correct icons
 * @param {*} names
 */
function queryIcons(names) {
  return new Promise((resolve, reject) => {
    let listener = (event) => {
      resolve(event.detail);
      // cleaning up
      document.removeEventListener("deliverIcon", listener);
    };

    setTimeout(() => {
      document.removeEventListener("deliverIcon", listener);
      reject("Tokenizer not responding");
    }, 500);
    document.addEventListener("deliverIcon", listener);
    document.dispatchEvent(new CustomEvent("queryIcons", { detail: { names: names } }));
  });
}

/**
 *
 * @param {[string]} spells Array of Strings or
 */
async function retrieveSpells(spells) {
  let compendiumName = await game.settings.get("ddb-importer", "entity-spell-compendium");
  const GET_ENTITY = true;

  const spellNames = spells.map((spell) => {
    if (typeof spell === "string") return spell;
    if (typeof spell === "object" && Object.prototype.hasOwnProperty.call(spell, "name")) return spell.name;
    return "";
  });

  return utils.queryCompendiumEntries(compendiumName, spellNames, GET_ENTITY);
}

async function getCompendium() {
  const compendiumName = await game.settings.get("ddb-importer", "entity-monster-compendium");
  if (compendiumName && compendiumName !== "") {
    const compendium = await game.packs.find((pack) => pack.collection === compendiumName);
    if (compendium) {
      return compendium;
    }
  }
  return undefined;
}

async function addNPCToCompendium(npc) {
  const compendium = await getCompendium();
  if (compendium) {
    // unlock the compendium for update/create
    compendium.locked = false;

    const index = await compendium.getIndex();
    const entity = index.find((entity) => entity.name.toLowerCase() === npc.name.toLowerCase());
    if (entity) {
      if (game.settings.get("ddb-importer", "munching-policy-update-existing")) {
        const compendiumNPC = JSON.parse(JSON.stringify(npc));
        compendiumNPC._id = entity._id;

        await compendium.updateEntity(compendiumNPC);
      }
    } else {
      await compendium.createEntity(npc);
    }
  } else {
    logger.error("Error opening compendium, check your settings");
  }
}

async function updateIcons(data) {
  // check for SRD icons
  const srdIcons = game.settings.get("ddb-importer", "munching-policy-use-srd-icons");
  // eslint-disable-next-line require-atomic-updates
  data.items = (srdIcons) ? await copySRDIcons(data.items) : data;
  // replace icons by iconizer, if available
  const itemNames = data.items.map((item) => {
    return {
      name: item.name,
    };
  });
  try {
    logger.debug("Querying iconizer for icons");
    const icons = await queryIcons(itemNames);
    logger.verbose("Icons found", icons);

    // replace the icons
    for (let item of data.items) {
      const icon = icons.find((icon) => icon.name === item.name);
      if (icon && (item.img == "" || item.img == "icons/svg/mystery-man.svg")) {
        item.img = icon.img;
      }
    }
  } catch (exception) {
    logger.log("Iconizer not responding");
  }
}


async function getNPCImage(data) {
  let dndBeyondImageUrl = data.flags.monsterMunch.img;
  const dndBeyondTokenImageUrl = data.flags.monsterMunch.tokenImg;
  const npcType = data.data.details.type;
  const uploadDirectory = game.settings.get("ddb-importer", "image-upload-directory").replace(/^\/|\/$/g, "");
  const downloadImages = game.settings.get("ddb-importer", "munching-policy-download-monster-images");

  if (!dndBeyondImageUrl && dndBeyondTokenImageUrl) dndBeyondImageUrl = dndBeyondTokenImageUrl;

  if (dndBeyondImageUrl && downloadImages) {
    const ext = dndBeyondImageUrl.split(".").pop().split(/#|\?|&/)[0];

    if (dndBeyondImageUrl.endsWith(npcType + "." + ext)) {
      const filename = "npc-generic-" + npcType.replace(/[^a-zA-Z]/g, "-").replace(/-+/g, "-").trim();
      const imageExists = await utils.fileExists(uploadDirectory, filename + "." + ext);

      if (!imageExists) {
        // eslint-disable-next-line require-atomic-updates
        data.img = await utils.uploadImage(dndBeyondImageUrl, uploadDirectory, filename);
      } else {
        // eslint-disable-next-line require-atomic-updates
        data.img = utils.getFileUrl(uploadDirectory, filename + "." + ext);
      }
    } else {
      // image upload
      const filename = "npc-" + data.name.replace(/[^a-zA-Z]/g, "-").replace(/-+/g, "-").trim();
      const imageExists = await utils.fileExists(uploadDirectory, filename + "." + ext);

      if (!imageExists) {
        // eslint-disable-next-line require-atomic-updates
        data.img = await utils.uploadImage(dndBeyondImageUrl, uploadDirectory, filename);
      } else {
        // eslint-disable-next-line require-atomic-updates
        data.img = utils.getFileUrl(uploadDirectory, filename + "." + ext);
      }
    }
  }

  if (dndBeyondImageUrl) {
    const tokenExt = dndBeyondTokenImageUrl.split(".").pop().split(/#|\?|&/)[0];

    if (dndBeyondTokenImageUrl.endsWith(npcType + "." + tokenExt)) {
      const filenameToken = "npc-generic-token-" + npcType.replace(/[^a-zA-Z]/g, "-").replace(/-+/g, "-").trim();
      const tokenImageExists = await utils.fileExists(uploadDirectory, filenameToken + "." + tokenExt);

      if (!tokenImageExists) {
        // eslint-disable-next-line require-atomic-updates
        data.token.img = await utils.uploadImage(dndBeyondTokenImageUrl, uploadDirectory, filenameToken);
      } else {
        // eslint-disable-next-line require-atomic-updates
        data.token.img = utils.getFileUrl(uploadDirectory, filenameToken + "." + tokenExt);
      }
    } else {
      // image upload
      const filenameToken = "npc-token-" + data.name.replace(/[^a-zA-Z]/g, "-").replace(/-+/g, "-").trim();
      const tokenImageExists = await utils.fileExists(uploadDirectory, filenameToken + "." + tokenExt);
      if (!tokenImageExists) {
        // eslint-disable-next-line require-atomic-updates
        data.token.img = await utils.uploadImage(dndBeyondTokenImageUrl, uploadDirectory, filenameToken);
      } else {
        // eslint-disable-next-line require-atomic-updates
        data.token.img = utils.getFileUrl(uploadDirectory, filenameToken + "." + tokenExt);
      }
    }
  }

}

async function addSpells(data) {
  const atWill = data.flags.monsterMunch.spellList.atwill;
  const klass = data.flags.monsterMunch.spellList.class;
  const innate = data.flags.monsterMunch.spellList.innate;

  if (atWill.length !== 0) {
    logger.debug("Retrieving at Will spells:", atWill);
    let spells = await retrieveSpells(atWill);
    spells = spells.filter((spell) => spell !== null).map((spell) => {
      if (spell.data.level == 0) {
        spell.data.preparation = {
          mode: "prepared",
          prepared: false,
        };
      } else {
        spell.data.preparation = {
          mode: "atwill",
          prepared: false,
        };
        spell.data.uses = {
          value: null,
          max: null,
          per: "",
        };
      }
      return spell;
    });
    // eslint-disable-next-line require-atomic-updates
    data.items = data.items.concat(spells);
  }

  // class spells
  if (klass.length !== 0) {
    logger.debug("Retrieving class spells:", klass);
    let spells = await retrieveSpells(klass);
    spells = spells.filter((spell) => spell !== null).map((spell) => {
      spell.data.preparation = {
        mode: "prepared",
        prepared: true,
      };
      return spell;
    });
    // eslint-disable-next-line require-atomic-updates
    data.items = data.items.concat(spells);
  }

  // innate spells
  if (innate.length !== 0) {
    const innateNames = innate.map((spell) => spell.name.replace(/’/g, "'"));
    // innate:
    // {name: "", type: "srt/lng/day", value: 0}
    logger.debug("Retrieving innate spells:", innateNames);
    const spells = await retrieveSpells(innateNames);
    const innateSpells = spells.filter((spell) => spell !== null)
      .map((spell) => {
        const spellInfo = innate.find((w) => w.name.replace(/’/g, "'").toLowerCase() == spell.name.toLowerCase());
        if (spellInfo) {
          spell.data.preparation = {
            mode: "innate",
            prepared: true,
          };
          const per = DICTIONARY.resets.find((d) => d.id == spellInfo.type);
          spell.data.uses = {
            value: spellInfo.value,
            max: spellInfo.value,
            per: (per && per.type) ? per.type : "day",
          };
        }
        return spell;
      });
    // eslint-disable-next-line require-atomic-updates
    data.items = data.items.concat(innateSpells);
  }
}

async function buildNPC(data) {
  logger.debug("Importing Images");
  await getNPCImage(data);
  await addSpells(data);
  logger.debug("Importing Icons");
  await updateIcons(data);
  // create the new npc
  logger.debug("Importing NPC");
  const options = {
    temporary: true,
    displaySheet: true,
  };
  let npc = await Actor.create(data, options);
  return npc;
}

async function parseNPC (data) {
  let npc = await buildNPC(data);
  await addNPCToCompendium(npc);
  return npc;
}

export function addNPC(data) {
  return new Promise((resolve, reject) => {
    parseNPC(data)
      .then((npc) => {
        resolve(npc);
      })
      .catch((error) => {
        logger.error(`error parsing NPC: ${error}`);
        reject(error);
      });
  });
}

