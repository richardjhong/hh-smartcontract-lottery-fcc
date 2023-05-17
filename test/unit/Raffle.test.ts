import { deployments, ethers, getNamedAccounts, network } from "hardhat";
import { developmentChains, networkConfig } from "../../helper-hardhat-config";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Raffle, VRFCoordinatorV2Mock } from "../../typechain-types";
import { BigNumber } from "ethers";
import { assert, expect } from "chai";

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle", async () => {
          let raffle: Raffle;
          let raffleContract: Raffle;
          let vrfCoordinatorV2Mock: VRFCoordinatorV2Mock;
          let player: SignerWithAddress;
          let accounts: SignerWithAddress[];
          let raffleEntranceFee: BigNumber;
          let interval: number;
          const chainId: number = network.config.chainId!;
          beforeEach(async () => {
              accounts = await ethers.getSigners();
              player = accounts[1];
              await deployments.fixture(["mocks", "raffle"]);
              raffleContract = await ethers.getContract("Raffle");
              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock");
              raffle = raffleContract.connect(player);
              raffleEntranceFee = await raffle.getEntranceFee();
              interval = (await raffle.getInterval()).toNumber();
          });

          describe("constructor", async () => {
              it("initializes the raffle correctly", async () => {
                  const raffleState = await raffle.getRaffleState();
                  assert.equal(raffleState.toString(), "0");
                  assert.equal(
                      interval.toString(),
                      networkConfig[chainId]["keepersUpdateInterval"]
                  );
              });
          });

          describe("enter raffle", async () => {
              it("reverts when you don't pay enough", async () => {
                  await expect(raffle.enterRaffle()).to.be.revertedWithCustomError(
                      raffle,
                      "Raffle__NotEnoughETHEntered"
                  );
              });
              it("records players when they enter", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee });
                  const playerFromContract = await raffle.getPlayer(0);
                  assert.equal(playerFromContract, player.address);
              });
              it("emits event on enter", async () => {
                  await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(
                      raffle,
                      "RaffleEnter"
                  );
              });
              it("denies entering raffle when raffle is calculating", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee });
                  await network.provider.send("evm_increaseTime", [interval + 1]);
                  await network.provider.request({ method: "evm_mine", params: [] });
                  await raffle.performUpkeep([]);
                  await expect(
                      raffle.enterRaffle({ value: raffleEntranceFee })
                  ).to.be.revertedWithCustomError(raffle, "Raffle__NotOpen");
              });
          });
      });
