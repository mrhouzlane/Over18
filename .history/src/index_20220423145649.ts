import {
  Field,
  SmartContract,
  state,
  State,
  isReady,
  Mina,
  Party,
  PrivateKey,
  method,
  UInt64,
  shutdown,
  Poseidon,
} from 'snarkyjs';
export class AgeProof extends SmartContract {
  @state(Field) hashChainProof = State<Field>();

  deploy(initialbalance: UInt64) {
    super.deploy();
    this.balance.addInPlace(initialbalance);
  }

  @method async createHashChainProof(_randomSeed: Field, _yearOfBirth: number) {
    const actualAge = 2022 - _yearOfBirth;
    let actualAgeHash = Poseidon.hash([_randomSeed]);
    for (let i = 1; i <= actualAge + 1; i++) {
      actualAgeHash = Poseidon.hash([actualAgeHash]);
    }
    this.hashChainProof.set(actualAgeHash);
  }

  @method async verifyIfBornBefore(_minimumYear: number, _proofOfDiff: Field) {
    const ageToProve = 2022 - _minimumYear;
    // for (let i = 1; i <= ageToProve + 1; i++) {
    for (let i = 0; i < ageToProve; i++) {
      _proofOfDiff = Poseidon.hash([_proofOfDiff]);
    }
    let actualAgeHash = await this.hashChainProof.get();
    // _proofOfDiff.assertEquals(actualAgeHash);
    actualAgeHash.assertEquals(_proofOfDiff);
  }
}

export async function run() {
  await isReady;

  const Local = Mina.LocalBlockchain();
  Mina.setActiveInstance(Local);
  const account1 = Local.testAccounts[0].privateKey;
  const account2 = Local.testAccounts[1].privateKey;
  const account3 = Local.testAccounts[2].privateKey;

  const snappPrivkey = PrivateKey.random();
  const snappPubkey = snappPrivkey.toPublicKey();

  let snappInstance: AgeProof;
  let randomSeed = Field.random();
  // let yearOfBirth = 1996;
  let yearOfBirth = 1996;
  let minimumYear = 2004;

  //deploy the snapp
  await Mina.transaction(account1, async () => {
    // account2 sends 1000000000 to the new snapp account
    const amount = UInt64.fromNumber(1000000000);
    const p = await Party.createSigned(account2);
    p.balance.subInPlace(amount);
    snappInstance = new AgeProof(snappPubkey);
    snappInstance.deploy(amount);
  })
    .send()
    .wait();

  console.log(
    'snapp balance after deployment: ',
    (await Mina.getBalance(snappPubkey)).toString()
  );

  await Mina.transaction(account2, async () => {
    snappInstance.createHashChainProof(randomSeed, yearOfBirth);
  })
    .send()
    .wait();

  let difference =
    minimumYear - yearOfBirth > 0 ? minimumYear - yearOfBirth : 0;

  let proofOfDiff = hashNTimes(difference, Poseidon.hash([randomSeed]));

  const a = await Mina.getAccount(snappPubkey);
  console.log('hash of the age is: ', a.snapp.appState[0].toString());
  // console.log('    proofOfDiff is: ', proofOfDiff);
  try {
    await Mina.transaction(account3, async () => {
      await snappInstance.verifyIfBornBefore(minimumYear, proofOfDiff);
    })
      .send()
      .wait();
    console.log('Your age has been proven!');
  } catch (e) {
    console.log(e);
    console.log('Your age has NOT been proven');
  }
}

run();
shutdown();

function hashNTimes(difference: number, arg1: Field): Field {
  let myHash = arg1;
  for (let i = 1; i <= difference + 1; i++) {
    myHash = Poseidon.hash([myHash]);
  }
  return myHash;
}
