
import process from "node:process";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from 'node:url';
import { Engine, MongoDatabase } from "./engine.js";
import { Logger } from "./gameObject.js";
import { Config } from "./config.js";
import chalk from "chalk";

// Configuration de base
Config.Set("modules", ["mongodb"]);
const MIGRATIONS_DIR = path.resolve(process.cwd(), 'migrations');
const MIGRATIONS_COLLECTION = 'migrations_log';

const engine = await Engine.Create();
const port = process.env.MIGRATE_PORT || 7640;

engine.start(port, async () => {
    const logger = engine.getComponent(Logger);
    logger.info("Migration Runner started on port " + port);

    const command = process.argv[2]; // 'up', 'down', 'create', 'status', 'to', 'revert'
    const target = process.argv[3]; // Le nom du fichier de migration cible

    try {
        const db = MongoDatabase;
        const { executedNames, allMigrationFiles } = await getMigrationStatus(db);

        switch (command) {
        case 'create':
            if (!target) throw new Error("Please provide a name for the migration.");
            await createMigrationFile(target, logger);
            break;
        case 'status':
            displayStatus(executedNames, allMigrationFiles, logger);
            break;
        case 'up':
            await runMigrations('up', null, logger, db, executedNames, allMigrationFiles);
            break;
        case 'down':
            // Annule la dernière migration
            await runMigrations('down', 'last', logger, db, executedNames, allMigrationFiles);
            break;
        case 'to':
            if (!target) throw new Error("Please specify a target migration file for the 'to' command.");
            await runMigrations('up', target, logger, db, executedNames, allMigrationFiles);
            break;
        case 'revert':
            if (!target) throw new Error("Please specify a target migration file for the 'revert' command. Use '0' to revert all.");
            await runMigrations('down', target, logger, db, executedNames, allMigrationFiles);
            break;
        default:
            throw new Error(`Unknown command: ${command}. Use 'up', 'down', 'create', 'status', 'to', 'revert'.`);
        }
    } catch (error) {
        logger.error(chalk.red("Migration process failed:"), error.message);
        if (error.stack) {
            logger.error(error.stack);
        }
        process.exit(1); // Sortir avec un code d'erreur
    } finally {
        logger.info("Migration process finished. Shutting down.");
        process.exit(0);
    }
});

async function getMigrationStatus(db) {
    const migrationLogCollection = db.collection(MIGRATIONS_COLLECTION);
    const executedMigrations = await migrationLogCollection.find().sort({ name: 1 }).toArray();
    const executedNames = new Set(executedMigrations.map(m => m.name));

    let allMigrationFiles = [];
    try {
        allMigrationFiles = (await fs.readdir(MIGRATIONS_DIR))
            .filter(file => file.endsWith('.js'))
            .sort();
    } catch (e) {
        if (e.code !== 'ENOENT') throw e;
        // Le dossier n'existe pas, c'est ok s'il n'y a aucune migration.
    }

    return { executedNames, allMigrationFiles };
}

function displayStatus(executedNames, allMigrationFiles, logger) {
    logger.info(chalk.bold('Migration Status:'));
    if (allMigrationFiles.length === 0) {
        logger.info('No migration files found.');
        return;
    }
    allMigrationFiles.forEach(file => {
        if (executedNames.has(file)) {
            logger.info(`${chalk.green('[Applied]')} ${file}`);
        } else {
            logger.info(`${chalk.yellow('[Pending]')} ${file}`);
        }
    });
}

async function runMigrations(direction, target, logger, db, executedNames, allMigrationFiles) {
    const migrationLogCollection = db.collection(MIGRATIONS_COLLECTION);

    if (direction === 'up') {
        let pendingMigrations = allMigrationFiles.filter(file => !executedNames.has(file));

        if (target) {
            const targetIndex = pendingMigrations.findIndex(file => file.startsWith(target) || file === target);
            if (targetIndex === -1) {
                logger.info(`Target migration '${target}' not found or already applied.`);
                return;
            }
            pendingMigrations = pendingMigrations.slice(0, targetIndex + 1);
        }

        if (pendingMigrations.length === 0) {
            logger.info(chalk.green("Database is already up to date."));
            return;
        }

        logger.info(`Applying ${pendingMigrations.length} new migration(s)...`);
        for (const fileName of pendingMigrations) {
            logger.info(`-> ${chalk.cyan('Running UP')}: ${fileName}`);
            const migrationPath = path.resolve(MIGRATIONS_DIR, fileName);
            // FIX: Convert the absolute path to a file URL for dynamic import
            const migration = await import(pathToFileURL(migrationPath).href);
            await migration.up(db);
            await migrationLogCollection.insertOne({ name: fileName, executedAt: new Date() });
            logger.info(`   ${chalk.green('OK')} - ${fileName} applied and logged.`);
        }
    }

    if (direction === 'down') {
        const executedFiles = allMigrationFiles
            .filter(file => executedNames.has(file))
            .sort((a, b) => b.localeCompare(a)); // Trier en ordre inverse pour la descente

        if (executedFiles.length === 0) {
            logger.info(chalk.yellow("No migrations to roll back."));
            return;
        }

        let migrationsToRevert;

        if (target === 'last') {
            migrationsToRevert = [executedFiles[0]]; // Juste la dernière
        } else if (target === '0') {
            migrationsToRevert = executedFiles; // Toutes les migrations
        } else {
            const targetIndex = executedFiles.findIndex(file => file.startsWith(target) || file === target);
            if (targetIndex === -1) {
                logger.info(`Target migration '${target}' not found among applied migrations.`);
                return;
            }
            migrationsToRevert = executedFiles.slice(0, targetIndex);
        }

        if (!migrationsToRevert || migrationsToRevert.length === 0) {
            logger.info(chalk.green("Already at the target state. No migrations to revert."));
            return;
        }

        logger.info(`Reverting ${migrationsToRevert.length} migration(s)...`);
        for (const fileName of migrationsToRevert) {
            logger.info(`-> ${chalk.cyan('Running DOWN')}: ${fileName}`);
            const migrationPath = path.resolve(MIGRATIONS_DIR, fileName);
            // FIX: Convert the absolute path to a file URL for dynamic import
            const migration = await import(pathToFileURL(migrationPath).href);
            await migration.down(db);
            await migrationLogCollection.deleteOne({ name: fileName });
            logger.info(`   ${chalk.green('OK')} - ${fileName} rolled back and removed from log.`);
        }
    }
}

// La fonction createMigrationFile reste la même
async function createMigrationFile(name, logger) {
    const timestamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 14);
    const sanitizedName = name.replace(/[^a-z0-9_]/gi, '-').toLowerCase();
    const fileName = `${timestamp}-${sanitizedName}.js`;
    const filePath = path.join(MIGRATIONS_DIR, fileName);

    const template = `
/**
 * Migration: ${name}
 * Created at: ${new Date().toISOString()}
 */
import { Db } from 'mongodb';

/**
 * La fonction 'up' est exécutée pour appliquer la migration.
 * @param {Db} db - L'instance de la base de données MongoDB.
 */
export const up = async (db) => {
  // Votre logique de migration ici. Exemple :
  // await db.collection('users').updateMany({}, { $set: { newField: 'defaultValue' } });
  console.log("Migration UP: ${fileName}");
};

/**
 * La fonction 'down' est exécutée pour annuler la migration.
 * @param {Db} db - L'instance de la base de données MongoDB.
 */
export const down = async (db) => {
  // Votre logique pour annuler la migration ici. Exemple :
  // await db.collection('users').updateMany({}, { $unset: { newField: '' } });
  console.log("Migration DOWN: ${fileName}");
};
`;

    await fs.mkdir(MIGRATIONS_DIR, { recursive: true });
    await fs.writeFile(filePath, template.trim());
    logger.info(`Created migration file: ${chalk.magenta(filePath)}`);
}