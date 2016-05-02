import libObjectId from 'libs/objectId';
import i18n from 'i18n';
import _ from 'lodash';

export default (DI, eventBus, db) => {

  const Contest = db.Contest;
  const ContestChallenge = db.ContestChallenge;
  const ContestEvent = db.ContestEvent;
  const ContestRegistration = db.ContestRegistration;

  const contestService = {};

  const updateFields = ['name', 'begin', 'end', 'regBegin', 'regEnd'];
  const updateChallengeFields = ['score', 'scoreDecrease', 'minScore'];

  /**
   * Create an contest event
   * @return {ContestEvent}
   */
  contestService.addEvent = async (contestId, content, args = {}) => {
    if (!libObjectId.isValid(contestId)) {
      throw new UserError(i18n.__('error.contest.notfound'));
    }
    const event = new ContestEvent({
      published: false,
      processed: false,
      contest: contestId,
      content,
      args,
    });
    await event.save();
    return event;
  };

  /**
   * Set whether a contest event is published
   * @return {ContestEvent}
   */
  contestService.setEventPublishState = async (eventId, published = true) => {
    const event = await ContestEvent.findOne({ _id: eventId });
    if (event === null) {
      throw new UserError(i18n.__('error.contestEvent.notfound'));
    }
    event.published = published;
    event.processed = true;
    await event.save();
    return event;
  };

  /**
   * Get events of a contest
   * @return {[ContestEvent]}
   */
  contestService.getEvents = async (contestId, filterNotPublished = true) => {
    const findExp = { contest: contestId };
    if (filterNotPublished) {
      findExp.published = true;
    }
    const events = await ContestEvent.find(findExp).sort({ updatedAt: -1 });
    return events;
  };

  /**
   * Retrive the count of challenges group by each contest
   */
  contestService.groupContestChallengeCount = async () => {
    // TODO
    return await ContestChallenge.aggregate([{
      $group: {
        _id: 'contest',
        count: {$sum: 1},
      },
    }]).exec();
  };

  /**
   * Get all contests
   * @return {[Contest]}
   */
  contestService.getContests = async () => {
    return await Contest.find({ deleted: false }).sort({ begin: -1 });
  };

  /**
   * Get a contest by its id
   * @return {Contest}
   */
  contestService.getContestObjectById = async (contestId, throwWhenNotFound = true) => {
    if (!libObjectId.isValid(contestId)) {
      if (throwWhenNotFound) {
        throw new UserError(i18n.__('error.contest.notfound'));
      } else {
        return null;
      }
    }
    const contest = await Contest.findOne({ _id: contestId, deleted: false });
    if (contest === null && throwWhenNotFound) {
      throw new UserError(i18n.__('error.contest.notfound'));
    }
    return contest;
  };

  /**
   * Get a contest challenge by its id
   * @return {ContestChallenge}
   */
  contestService.getContestChallengeObjectById = async (contestChallengeId, throwWhenNotFound = true) => {
    if (!libObjectId.isValid(contestChallengeId)) {
      if (throwWhenNotFound) {
        throw new UserError(i18n.__('error.contest.challenge.notfound'));
      } else {
        return null;
      }
    }
    const cc = await ContestChallenge.findOne({ _id: contestChallengeId });
    if (cc === null && throwWhenNotFound) {
      throw new UserError(i18n.__('error.contest.challenge.notfound'));
    }
    return cc;
  };

  /**
   * Validate the regBegin, regEnd, begin, end property of a contest
   */
  contestService.validateContestDate = (contest) => {
    if (contest.regBegin.getTime() >= contest.regEnd.getTime()) {
      throw new Error('error.contest.regBegin.greaterThanEnd');
    }
    if (contest.begin.getTime() >= contest.end.getTime()) {
      throw new Error('error.contest.begin.greaterThanEnd');
    }
    if (contest.begin.getTime() <= Date.now()) {
      throw new Error('error.contest.begin.lessThanNow');
    }
    if (contest.regEnd.getTime() >= contest.end.getTime()) {
      throw new Error('error.contest.regEnd.greaterThanEnd');
    }
  };

  /**
   * Create a contest with an empty challenge list
   * @return {Contest} The new contest object
   */
  contestService.createContest = async (props) => {
    if (props !== Object(props)) {
      throw new Error('Expect parameter "props" to be an object');
    }
    const obj = {
      deleted: false,
      ..._.pick(props, updateFields),
    };
    const contest = new Contest(obj);
    contestService.validateContestDate(contest);
    await contest.save();
    return contest;
  };

  /**
   * Update contest properties
   * @return {Contest} The new contest object
   */
  contestService.updateContest = async (contestId, props) => {
    if (props !== Object(props)) {
      throw new Error('Expect parameter "props" to be an object');
    }
    const contest = await contestService.getContestObjectById(contestId);
    const updater = _.pick(props, updateFields);
    _.assign(contest, updater);
    contestService.validateContestDate(contest);
    await contest.save();
    return contest;
  };

  /**
   * Add a challenge to the contest
   * @return {ContestChallenge}
   */
  contestService.addChallenge = async (contestId, challengeId, props) => {
    if (props !== Object(props)) {
      throw new Error('Expect parameter "props" to be an object');
    }
    // check existance and deletion
    const contest = contestService.getContestObjectById(contestId);
    const challenge = DI.get('challengeService').getChallengeObjectById(challengeId);

    const contestChallenge = new ContestChallenge({
      contest: contest._id,
      challenge: challenge._id,
      visible: false,
      ..._.pick(props, updateChallengeFields),
    });
    try {
      await contestChallenge.save();
    } catch(e) {
      if (e.name === 'MongoError' && e.code === 11000) {
        // duplicate key error
        throw new UserError(i18n.__('error.contest.challenge.exist'));
      } else {
        throw e;
      }
    }
    return contestChallenge;
  };

  /**
   * Set the property of a challenge of a contest
   * @return {ContestChallenge}
   */
  contestService.setChallengeProps = async (contestChallengeId, props) => {
    if (props !== Object(props)) {
      throw new Error('Expect parameter "props" to be an object');
    }
    const contestChallenge = await contestService.getContestChallengeObjectById(contestChallengeId);
    const updater = _.pick(props, updateChallengeFields);
    _.assign(contestChallenge, updater);
    await contestChallenge.save();
    return contestChallenge;
  };

  /**
   * Open or close a challenge to contesters
   * @return {ContestChallenge}
   */
  contestService.setChallengeVisibility = async (contestChallengeId, visibility = true) => {
    const contestChallenge = await contestService.getContestChallengeObjectById(contestChallengeId);
    const emitEvent = (contestChallenge.visible !== true && visibility === true);
    contestChallenge.visible = (visibility === true);
    await contestChallenge.save();
    if (emitEvent) {
      eventBus.emit('contest.challenge.open', contestChallenge);
    }
    return contestChallenge;
  };

  /**
   * Get all challenges of a contest
   * @return {[ContestChallenge]}
   */
  contestService.getChallenges = async (contestId, filterNotVisible = true) => {
    const findExp = { contest: contestId };
    if (filterNotVisible) {
      findExp.visible = true;
    }
    const contestChallenges = await ContestChallenge
      .find(findExp)
      .sort({ updatedAt: -1 })
      .populate('challenge', { name: 1, category: 1, difficulty: 1 });
    return contestChallenges;
  };

  /**
   * Whether a user has registered a contest
   * @return {Boolean}
   */
  contestService.isContestRegistered = async (contestId, userId) => {
    if (!libObjectId.isValid(contestId)) {
      return false;
    }
    if (!libObjectId.isValid(userId)) {
      return false;
    }
    const rec = await ContestRegistration.findOne({
      user: userId,
      contest: contestId,
    });
    return (rec !== null);
  };

  /**
   * Register a contest
   * @return {ContestRegistration}
   */
  contestService.registerContest = async (contestId, userId) => {
    if (!libObjectId.isValid(contestId)) {
      throw new UserError(i18n.__('error.contest.notfound'));
    }
    if (!libObjectId.isValid(userId)) {
      throw new UserError(i18n.__('error.user.notfound'));
    }
    const contest = contestService.getContestObjectById(contestId);
    const now = Date.now();
    if (now < contest.regBegin.getTime()) {
      throw new UserError(i18n.__('error.contest.registration.notReady'));
    }
    if (now >= contest.regEnd.getTime()) {
      throw new UserError(i18n.__('error.contest.registration.passed'));
    }
    const reg = new ContestRegistration({
      contest: contestId,
      user: userId,
    });
    try {
      await reg.save();
    } catch (e) {
      if (e.name === 'MongoError' && e.code === 11000) {
        // duplicate key error
        throw new UserError(i18n.__('error.contest.registration.registered'));
      } else {
        throw e;
      }
    }
    return reg;
  };

  /**
   * Get all registrants of a contest
   * @return {[User]}
   */
  contestService.getRegistrants = async (contestId) => {
    const registrants = await ContestRegistration
      .find({ contest: contestId })
      .sort({ createdAt: -1 })
      .populate('user', { username: 1, profile: 1 });
    return registrants;
  };

  contestService.checkBodyForCreateOrEdit = (req, res, next) => {
    updateFields.forEach(field => {
      req.checkBody(field, i18n.__('error.validation.required')).notEmpty();
    });
    next();
  };

  /**
   * Handle challenge update. When a challenge is updated
   * and it is part of an active contest, create an event
   */
  eventBus.on('challenge.description.update', async (challenge) => {
    const contestChallenges = await ContestChallenge
      .find({
        challenge: challenge._id,
        visible: true,
      })
      .populate('contest');
    for (const cc of contestChallenges) {
      if (!cc.contest.deleted && cc.contest.getState() === 'ACTIVE') {
        contestService.addEvent(
          cc.contest._id,
          'event.contest.challenge.updated',
          { name: challenge.name }
        );
      }
    }
  });

  /**
   * Handle challenge open. When a challenge is open
   * and it is part of an active contest, create an event
   */
  eventBus.on('contest.challenge.open', async (contestChallenge) => {
    contestChallenge = await contestChallenge
      .populate('contest')
      .populate('challenge');
    if (
      contestChallenge.contest.deleted
      || contestChallenge.challenge.deleted
    ) {
      return;
    }
    if (contestChallenge.contest.getState() === 'ACTIVE') {
      contestService.addEvent(
        contestChallenge.contest._id,
        'event.contest.challenge.open',
        { name: contestChallenge.challenge.name }
      );
    }
  });

  return contestService;

};