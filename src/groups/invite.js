'use strict';
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const _ = require('lodash');
const db = require('../database');
const user = require('../user');
const slugify = require('../slugify');
const plugins = require('../plugins');
const notifications = require('../notifications');
module.exports = function (Groups) {
    Groups.getPending = function (groupName) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield Groups.getUsersFromSet(`group:${groupName}:pending`, ['username', 'userslug', 'picture']);
        });
    };
    Groups.getInvites = function (groupName) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield Groups.getUsersFromSet(`group:${groupName}:invited`, ['username', 'userslug', 'picture']);
        });
    };
    Groups.requestMembership = function (groupName, uid) {
        return __awaiter(this, void 0, void 0, function* () {
            yield inviteOrRequestMembership(groupName, uid, 'request');
            const { displayname } = yield user.getUserFields(uid, ['username']);
            const [notification, owners] = yield Promise.all([
                notifications.create({
                    type: 'group-request-membership',
                    bodyShort: `[[groups:request.notification-title, ${displayname}]]`,
                    bodyLong: `[[groups:request.notification-text, ${displayname}, ${groupName}]]`,
                    nid: `group:${groupName}:uid:${uid}:request`,
                    path: `/groups/${slugify(groupName)}`,
                    from: uid,
                }),
                Groups.getOwners(groupName),
            ]);
            yield notifications.push(notification, owners);
        });
    };
    Groups.acceptMembership = function (groupName, uid) {
        return __awaiter(this, void 0, void 0, function* () {
            yield db.setsRemove([`group:${groupName}:pending`, `group:${groupName}:invited`], uid);
            yield Groups.join(groupName, uid);
            const notification = yield notifications.create({
                type: 'group-invite',
                bodyShort: `[[groups:membership.accept.notification-title, ${groupName}]]`,
                nid: `group:${groupName}:uid:${uid}:invite-accepted`,
                path: `/groups/${slugify(groupName)}`,
                icon: 'fa-users',
            });
            yield notifications.push(notification, [uid]);
        });
    };
    Groups.rejectMembership = function (groupNames, uid) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!Array.isArray(groupNames)) {
                groupNames = [groupNames];
            }
            const sets = [];
            groupNames.forEach(groupName => sets.push(`group:${groupName}:pending`, `group:${groupName}:invited`));
            yield db.setsRemove(sets, uid);
        });
    };
    Groups.invite = function (groupName, uids) {
        return __awaiter(this, void 0, void 0, function* () {
            uids = Array.isArray(uids) ? uids : [uids];
            uids = yield inviteOrRequestMembership(groupName, uids, 'invite');
            const notificationData = yield Promise.all(uids.map((uid) => notifications.create({
                type: 'group-invite',
                bodyShort: `[[groups:invited.notification-title, ${groupName}]]`,
                bodyLong: '',
                nid: `group:${groupName}:uid:${uid}:invite`,
                path: `/groups/${slugify(groupName)}`,
                icon: 'fa-users',
            })));
            yield Promise.all(uids.map((uid, index) => notifications.push(notificationData[index], uid)));
        });
    };
    function inviteOrRequestMembership(groupName, uids, type) {
        return __awaiter(this, void 0, void 0, function* () {
            uids = Array.isArray(uids) ? uids : [uids];
            uids = uids.filter(uid => parseInt(uid, 10) > 0);
            const [exists, isMember, isPending, isInvited] = yield Promise.all([
                Groups.exists(groupName),
                Groups.isMembers(uids, groupName),
                Groups.isPending(uids, groupName),
                Groups.isInvited(uids, groupName),
            ]);
            if (!exists) {
                throw new Error('[[error:no-group]]');
            }
            uids = uids.filter((uid, i) => !isMember[i] && ((type === 'invite' && !isInvited[i]) || (type === 'request' && !isPending[i])));
            const set = type === 'invite' ? `group:${groupName}:invited` : `group:${groupName}:pending`;
            yield db.setAdd(set, uids);
            const hookName = type === 'invite' ? 'inviteMember' : 'requestMembership';
            plugins.hooks.fire(`action:group.${hookName}`, {
                groupName: groupName,
                uids: uids,
            });
            return uids;
        });
    }
    Groups.isInvited = function (uids, groupName) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield checkInvitePending(uids, `group:${groupName}:invited`);
        });
    };
    Groups.isPending = function (uids, groupName) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield checkInvitePending(uids, `group:${groupName}:pending`);
        });
    };
    function checkInvitePending(uids, set) {
        return __awaiter(this, void 0, void 0, function* () {
            const isArray = Array.isArray(uids);
            uids = isArray ? uids : [uids];
            const checkUids = uids.filter(uid => parseInt(uid, 10) > 0);
            const isMembers = yield db.isSetMembers(set, checkUids);
            const map = _.zipObject(checkUids, isMembers);
            return isArray ? uids.map(uid => !!map[uid]) : !!map[uids[0]];
        });
    }
};
