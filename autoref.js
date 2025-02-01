
import { ethers } from 'ethers'
import fs from 'fs/promises'
import readline from 'readline'
import log from './utils/logger.js'
import LayerEdge from './utils/socket.js';
import { readFiles } from './utils/helper.js';

const WALLETS_PATH = 'walletsRef.json'

function createNewWallet() {
    const wallet = ethers.Wallet.createRandom();

    const walletDetails = {
        address: wallet.address,
        privateKey: wallet.privateKey,
        mnemonic: wallet.mnemonic.phrase
    };

    log.info("New Ethereum Wallet created Address:", walletDetails.address);

    return walletDetails;
}

async function saveWalletToFile(walletDetails) {
    let wallets = [];
    try {
        await fs.access(WALLETS_PATH).catch(async () => {
            await fs.writeFile(WALLETS_PATH, "[]");
        });

        const data = await fs.readFile(WALLETS_PATH, "utf8");
        wallets = JSON.parse(data);
    } catch (err) {
        log.error(`Error reading ${WALLETS_PATH}:`, err);
    }

    wallets.push(walletDetails);

    try {
        await fs.writeFile(WALLETS_PATH, JSON.stringify(wallets, null, 2));
        log.info("Wallet saved to:", WALLETS_PATH);
    } catch (err) {
        log.error("Error writing to walletsRef.json:", err);
    }
}

// Function to ask a question 
async function askQuestion(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}
async function readWallets() {
    try {
        await fs.access("wallets.json");

        const data = await fs.readFile("wallets.json", "utf-8");
        return JSON.parse(data);
    } catch (err) {
        if (err.code === 'ENOENT') {
            log.info("No wallets found in wallets.json");
            return [];
        }
        throw err;
    }
}
async function autoRegister() {
    const proxies = await readFiles('proxy.txt');
    const wallets = await readWallets()
    if (proxies.length === 0) {
        log.warn('No proxies found, running without proxy...');
    }
    const maxRefCount = 50;
    const minPoints = 100000; // 50 hours uptime
    let proxy;

    for (let j = 0; j < wallets.length; j++) {
        const wallet = wallets[j]
        proxy = proxies[j % proxies.length] || null;
        const socket = new LayerEdge(proxy, wallet.privateKey);
        log.info(`Trying to get referral code from existing account...`)

        const { refCode, nodePoints, referralCount } = await socket.checkNodePoints()
        log.info(`Found active ref code:`, refCode)
        if (!refCode) continue;
        const isValid = await socket.checkInvite(refCode)
        if (!isValid) continue;

        if (nodePoints > minPoints && referralCount < maxRefCount) {
            try {
                for (let i = referralCount; i < maxRefCount; i++) {
                    proxy = proxies[i % proxies.length] || null;
                    log.info(`Create and Registering Wallets: ${i + 1}/${maxRefCount} Using Proxy:`, proxy);
                    const walletDetails = createNewWallet();
                    const refSocket = new LayerEdge(proxy, walletDetails.privateKey);

                    const isRegistered = await refSocket.registerWallet(refCode);
                    if (isRegistered) {
                        saveWalletToFile(walletDetails);
                    }

                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (error) {
                log.error('Error creating wallet:', error.message);
            }
        } else {
            log.warn(`This wallets points less than 100k or already reached max ref counts`)
        }
    }
}

autoRegister()
