import "server-only";
import * as q from "./queries";
import * as insights from "./insights";
import * as extra from "./queries-extra";
import { exportUserData } from "./export";

/** Every read the app makes, answered from the in-memory JSON store. This is the
 *  reference implementation: the Postgres one has to return the same values. */
export const jsonReads = {
  // home / discover
  trendingSongs: q.trendingSongs, highlyRated: q.highlyRated, hiddenGems: q.hiddenGems, newReleases: q.newReleases,
  trendingReviews: q.trendingReviews, popularLists: q.popularLists, recentReviews: q.recentReviews,
  friendsListening: q.friendsListening, friendsFavourites: q.friendsFavourites, suggestedUsers: q.suggestedUsers,
  catalogueSize: q.catalogueSize, artworkWall: q.artworkWall, recommendations: insights.recommendations, becauseYouLike: insights.becauseYouLike,
  // catalogue pages
  getSongPage: q.getSongPage, similarSongs: q.similarSongs, getArtistPage: q.getArtistPage, getAlbumPage: q.getAlbumPage,
  allGenres: q.allGenres, getGenrePage: q.getGenrePage, viewerStates: q.viewerStates, search: q.search,
  // people
  getUserByName: q.getUserByName, getProfile: q.getProfile, profileOverview: q.profileOverview, getDiary: q.getDiary,
  getUserReviews: q.getUserReviews, getUserLists: q.getUserLists, getUserLikes: q.getUserLikes, getFollowList: q.getFollowList,
  compatibility: q.compatibility, userStats: insights.userStats, yearInReview: insights.yearInReview,
  // reviews, lists, feed
  getReview: q.getReview, getComments: q.getComments, getListPage: q.getListPage, viewerLists: q.viewerLists, browseLists: q.browseLists,
  getListenLater: q.getListenLater, getFeed: q.getFeed, getNotifications: q.getNotifications, unreadCount: q.unreadCount,
  // small reads for pages that used to touch the store directly
  adminOverview: extra.adminOverview, songLite: extra.songLite, followingIds: extra.followingIds,
  onboardingData: extra.onboardingData, sitemapData: extra.sitemapData, ping: extra.ping,
  songSlugByExternalId: extra.songSlugByExternalId, songIdBySlug: extra.songIdBySlug, albumByExternalId: extra.albumByExternalId,
  artistLookup: extra.artistLookup, knownTracks: extra.knownTracks, knownArtistNames: extra.knownArtistNames, knownAlbumIds: extra.knownAlbumIds,
  findLocalSongs: extra.findLocalSongs, userActive: extra.userActive,
  exportUserData,
};
