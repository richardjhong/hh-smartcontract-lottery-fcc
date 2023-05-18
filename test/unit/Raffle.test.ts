import { deployments, ethers, network } from "hardhat";
import { developmentChains, networkConfig } from "../../helper-hardhat-config";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Raffle, VRFCoordinatorV2Mock } from "../../typechain-types";
import { BigNumber } from "ethers";
import { assert, expect } from "chai";

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Unit Tests", () => {
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

          describe("fulfillRandomWords", function () {
              beforeEach(async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee });
                  await network.provider.send("evm_increaseTime", [interval + 1]);
                  await network.provider.request({ method: "evm_mine", params: [] });
              });
              it("can only be called after performupkeep", async () => {
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address) // reverts if not fulfilled
                  ).to.be.revertedWith("nonexistent request");
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address) // reverts if not fulfilled
                  ).to.be.revertedWith("nonexistent request");
              });

              // This test simulates users entering the raffle and wraps the entire functionality of the raffle
              // inside a promise that will resolve if everything is successful.
              // An event listener for the WinnerPicked is set up
              // Mocks of chainlink keepers and vrf coordinator are used to kickoff this winnerPicked event
              // All the assertions are done once the WinnerPicked event is fired
              it("picks a winner, resets, and sends money", async () => {
                  const additionalEntrances = 3; // to test
                  const startingIndex = 2;
                  for (let i = startingIndex; i < startingIndex + additionalEntrances; i++) {
                      // i = 2; i < 5; i=i+1
                      raffle = raffleContract.connect(accounts[i]); // Returns a new instance of the Raffle contract connected to player
                      await raffle.enterRaffle({ value: raffleEntranceFee });
                  }
                  const startingTimeStamp = await raffle.getLatestTimeStamp(); // stores starting timestamp (before we fire our event)

                  // This will be more important for our staging tests...
                  await new Promise<void>(async (resolve, reject) => {
                      raffle.once("WinnerPicked", async () => {
                          // event listener for WinnerPicked
                          console.log("WinnerPicked event fired!");
                          // assert throws an error if it fails, so we need to wrap
                          // it in a try/catch so that the promise returns event
                          // if it fails.
                          try {
                              // Now lets get the ending values...
                              const recentWinner = await raffle.getRecentWinner();
                              const raffleState = await raffle.getRaffleState();
                              const winnerBalance = await accounts[2].getBalance();
                              const endingTimeStamp = await raffle.getLatestTimeStamp();
                              console.log("recentWinner");
                              await expect(raffle.getPlayer(0)).to.be.reverted;
                              // Comparisons to check if our ending values are correct:
                              assert.equal(recentWinner.toString(), accounts[2].address);
                              assert.equal(raffleState, 0);
                              assert.equal(
                                  winnerBalance.toString(),
                                  startingBalance // startingBalance + ( (raffleEntranceFee * additionalEntrances) + raffleEntranceFee )
                                      .add(
                                          raffleEntranceFee
                                              .mul(additionalEntrances)
                                              .add(raffleEntranceFee)
                                      )
                                      .toString()
                              );
                              assert(endingTimeStamp > startingTimeStamp);
                          } catch (err) {
                              reject(err);
                          }
                      });
                      resolve(); // if try passes, resolves the promise

                      // kicking off the event by mocking the chainlink keepers and vrf coordinator
                      const tx = await raffle.performUpkeep("0x");
                      const txReceipt = await tx.wait(1);
                      const startingBalance = await accounts[2].getBalance();
                      await vrfCoordinatorV2Mock.fulfillRandomWords(
                          txReceipt!.events![1].args!.requestId,
                          raffle.address
                      );
                  });
              });
          });
      });
