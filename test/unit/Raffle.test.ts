import { deployments, ethers, network } from "hardhat";
import { developmentChains, networkConfig } from "../../helper-hardhat-config";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Raffle, VRFCoordinatorV2Mock } from "../../typechain-types";
import { BigNumber } from "ethers";
import { assert, expect } from "chai";

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle", () => {
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

          describe("constructor", () => {
              it("initializes the raffle correctly", async () => {
                  const raffleState = await raffle.getRaffleState();
                  assert.equal(raffleState.toString(), "0");
                  assert.equal(
                      interval.toString(),
                      networkConfig[chainId]["keepersUpdateInterval"]
                  );
              });
          });

          describe("enter raffle", () => {
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

          describe("checkUpkeep", () => {
              it("returns false if people haven't sent any ETH", async () => {
                  await network.provider.send("evm_increaseTime", [interval + 1]);
                  await network.provider.request({ method: "evm_mine", params: [] });
                  const { _upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x");
                  assert(!_upkeepNeeded);
              });
              it("returns false if raffle isn't open", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee });
                  await network.provider.send("evm_increaseTime", [interval + 1]);
                  await network.provider.request({ method: "evm_mine", params: [] });
                  await raffle.performUpkeep("0x");
                  const raffleState = await raffle.getRaffleState();
                  const { _upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x");
                  assert.equal(raffleState.toString(), "1");
                  assert.equal(_upkeepNeeded, false);
              });
              it("returns false if enough time hasn't passed", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee });
                  await network.provider.send("evm_increaseTime", [interval - 2]);
                  await network.provider.request({ method: "evm_mine", params: [] });
                  const { _upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x");
                  console.log("testing", _upkeepNeeded);
                  assert.equal(_upkeepNeeded, false);
              });
              it("returns true if enough time has passed, has players, eth, and is open", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee });
                  await network.provider.send("evm_increaseTime", [interval + 1]);
                  await network.provider.request({ method: "evm_mine", params: [] });
                  const { _upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x");
                  assert(_upkeepNeeded);
              });
          });

          describe("performUpkeep", () => {
              it("can only run if checkUpkeep is true", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee });
                  await network.provider.send("evm_increaseTime", [interval + 1]);
                  await network.provider.request({ method: "evm_mine", params: [] });
                  const tx = await raffle.performUpkeep([]);
                  assert(tx);
              });
              it("reverts when checkUpkeep is false", async () => {
                  await expect(raffle.performUpkeep([])).to.be.revertedWithCustomError(
                      raffle,
                      "Raffle__UpkeepNotNeeded"
                  );
              });
              it("updates the raffle state and emits a requestId", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee });
                  await network.provider.send("evm_increaseTime", [interval + 1]);
                  await network.provider.request({ method: "evm_mine", params: [] });
                  const txResponse = await raffle.performUpkeep("0x");
                  const txReceipt = await txResponse.wait(1);
                  const raffleState = await raffle.getRaffleState();
                  const requestId = txReceipt!.events![1].args!.requestId;
                  assert(requestId.toNumber() > 0);
                  assert(raffleState == 1);
              });
          });
      });
